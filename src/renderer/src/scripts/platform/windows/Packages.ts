import { log, logBlock } from "@renderer/scripts/LauncherLog";

const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");
const { Buffer } = window.require("buffer") as typeof import("buffer");

type RegeditModule = typeof import("regedit-rs");

const PACKAGES_KEY =
    "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";

const APP_MODEL_UNLOCK_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";
const APPX_POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Appx";

/** Any Minecraft Bedrock package family, not a fixed list — release, preview, and whatever ships next. */
const MINECRAFT_FAMILY_PREFIX = "microsoft.minecraft";

export interface RegisteredPackage {
    /** Identity name, e.g. `Microsoft.MinecraftWindowsBeta`. */
    family: string;
    /** `<name>_<publisherHash>`, the first half of an AUMID. */
    familyName: string;
    installPath: string;
}

/**
 * Why a registration was refused. Decided from the live registry state first and the
 * PowerShell error text second, because the registry is ground truth and the message
 * wording is not guaranteed stable.
 */
export type RegistrationBlocker =
    | "developer-mode"
    | "sideloading-policy"
    | "conflicting-registration"
    | "package-in-use"
    | "unknown";

export class PackageRegistrationError extends Error {
    constructor(readonly blocker: RegistrationBlocker, readonly detail: string, message: string) {
        super(message);
        this.name = "PackageRegistrationError";
    }
}

/** `<name>_<version>_<arch>__<publisherHash>` collapses to `<name>_<publisherHash>`. */
function familyNameFrom(packageFullName: string): string {
    const parts = packageFullName.split("_");
    if (parts.length < 2 || parts[0] === "" || parts[parts.length - 1] === "") {
        throw new Error(`Cannot derive a package family name from "${packageFullName}"`);
    }
    return `${parts[0]}_${parts[parts.length - 1]}`;
}

/** The manifest's `<Application Id>`, the second half of an AUMID. */
export function readApplicationId(versionPath: string): string {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const id = fs.readFileSync(manifest, "utf-8").match(/<Application\s+Id="([^"]+)"/)?.[1];
    if (!id) throw new Error(`${manifest}: no <Application Id>`);
    return id;
}

function regedit(): RegeditModule {
    return window.require("regedit-rs") as RegeditModule;
}

interface PowerShellResult {
    code: number;
    stdout: string;
    stderr: string;
    /** stdout and stderr together, which is what the failure text has to be read out of. */
    output: string;
}

/**
 * Base64 rather than a quoted `-Command` string: the script carries manifest paths and
 * nested scripts, and cmd/PowerShell quoting mangles those (it silently ate an earlier
 * version of this very script). Never rejects — callers classify the exit code themselves.
 */
/**
 * powershell.exe serialises its progress stream onto stderr as a multi-kilobyte CLIXML blob.
 * It is noise, and left in it swamps the log and the message the user sees. Every diagnostic
 * this module cares about is written to stdout deliberately, so dropping the tail is safe.
 */
function stripClixml(text: string): string {
    return text.replace(/#<\s*CLIXML[\s\S]*$/, "").trim();
}

function runPowerShell(script: string): Promise<PowerShellResult> {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return new Promise(resolve => {
        child.execFile(
            "powershell.exe",
            ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
            { maxBuffer: 8 * 1024 * 1024 },
            (error, stdout, stderr) => {
                const code = error ? ((error as { code?: number }).code ?? 1) : 0;
                const cleanStderr = stripClixml(stderr);
                const output = [stdout.trim(), cleanStderr].filter(Boolean).join("\n");
                resolve({ code, stdout, stderr: cleanStderr, output });
            }
        );
    });
}

function quote(value: string): string {
    return value.replace(/'/g, "''");
}

function readDword(key: string, name: string): number | null {
    try {
        const listed = regedit().listSync(key)[key];
        if (!listed.exists) return null;
        const value = listed.values[name]?.value;
        return typeof value === "number" ? value : null;
    } catch {
        return null;
    }
}

/**
 * Registering an unpacked build from a loose appxmanifest.xml is a developer operation, so
 * Windows refuses it (HRESULT 0x80073CFF) unless this is set. The Settings app writes it
 * when Developer Mode is switched on; it is the single value that differs between a machine
 * where the launcher works and one where registration silently does nothing.
 */
export function isDeveloperModeEnabled(): boolean {
    return readDword(APP_MODEL_UNLOCK_KEY, "AllowDevelopmentWithoutDevLicense") === 1;
}

/**
 * Group policy or an MDM/Intune profile overrides AppModelUnlock. When it does, writing
 * AppModelUnlock ourselves is pointless: the policy wins and gets re-applied. This is the
 * one cause the launcher genuinely cannot repair.
 */
export function isSideloadingBlockedByPolicy(): boolean {
    return readDword(APPX_POLICY_KEY, "AllowAllTrustedApps") === 0
        || readDword(APPX_POLICY_KEY, "AllowDevelopmentWithoutDevLicense") === 0;
}

/** The package family a build registers as, read from the build itself. */
export function readIdentityName(versionPath: string): string {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const xml = fs.readFileSync(manifest, "utf-8");
    const match = xml.match(/<Identity\s+Name="([^"]+)"/);
    if (!match) throw new Error(`No <Identity Name> in ${manifest}`);
    return match[1];
}

export function listRegistered(): RegisteredPackage[] {
    const listed = regedit().listSync(PACKAGES_KEY);
    if (!listed[PACKAGES_KEY].exists) return [];

    const out: RegisteredPackage[] = [];
    for (const key of listed[PACKAGES_KEY].keys) {
        if (!key.toLowerCase().startsWith(MINECRAFT_FAMILY_PREFIX)) continue;

        const fullKey = `${PACKAGES_KEY}\\${key}`;
        const values = regedit().listSync(fullKey)[fullKey];
        if (!values.exists) throw new Error(`Registry key ${fullKey} vanished while being read`);

        const installPath = values.values["PackageRootFolder"]?.value as string | undefined;
        if (!installPath) throw new Error(`Registry key ${fullKey} is missing PackageRootFolder`);

        out.push({ family: key.split("_")[0], familyName: familyNameFrom(key), installPath });
    }
    return out;
}

function samePath(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** The registration `activate()` will later look for, so this is exactly the postcondition that matters. */
function findRegistration(identity: string, versionPath: string): RegisteredPackage | null {
    return listRegistered().find(
        pkg => pkg.family.toLowerCase() === identity.toLowerCase() && samePath(pkg.installPath, versionPath)
    ) ?? null;
}

function classify(output: string): RegistrationBlocker {
    const text = output.toLowerCase();

    // Unambiguous enough to outrank the registry checks, and true regardless of them.
    if (text.includes("0x80073d02") || text.includes("need to be closed") || text.includes("currently in use")) {
        return "package-in-use";
    }

    if (isSideloadingBlockedByPolicy()) return "sideloading-policy";
    if (!isDeveloperModeEnabled()) return "developer-mode";

    if (text.includes("0x80073cff") || text.includes("developer license") || text.includes("sideload")) {
        return "developer-mode";
    }
    if (
        text.includes("0x80073cfb") || text.includes("0x80073d06") || text.includes("0x80073cf6")
        || text.includes("already exists") || text.includes("already installed")
    ) {
        return "conflicting-registration";
    }
    return "unknown";
}

export async function unregister(family: string): Promise<void> {
    const result = await runPowerShell(
        `$ErrorActionPreference = 'Stop'\n`
        + `try {\n`
        + `    Get-AppxPackage '${quote(family)}' | Remove-AppxPackage -PreserveRoamableApplicationData -ErrorAction Stop\n`
        + `}\n`
        + `catch {\n`
        + `    Write-Output ('HRESULT=0x{0:X8}' -f $_.Exception.HResult)\n`
        + `    Write-Output ('MESSAGE=' + ($_.Exception.Message -replace '\\r?\\n', ' '))\n`
        + `    exit 1\n`
        + `}\n`
    );

    if (result.code !== 0) {
        logBlock("Packages", `Unregister ${family} failed (exit ${result.code})`, result.output);
        throw new Error(`Could not remove the existing ${family} registration. ${result.output}`);
    }
    log("Packages", `Unregistered ${family}`);
}

/**
 * `Add-AppxPackage` reports its failures as non-terminating errors, so powershell.exe exits 0
 * even when nothing was registered. That made every failure look like a success and only
 * surfaced later as "is not registered, so it cannot be activated". Hence both halves here:
 * the script is forced to exit non-zero, and success is confirmed by reading the registration
 * back rather than trusted.
 */
export async function register(versionPath: string): Promise<void> {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const identity = readIdentityName(versionPath);

    log("Packages", `Registering ${identity} from ${versionPath}`);

    const result = await runPowerShell(
        `$ErrorActionPreference = 'Stop'\n`
        + `try {\n`
        + `    Add-AppxPackage -Path '${quote(manifest)}' -Register -ErrorAction Stop\n`
        + `}\n`
        + `catch {\n`
        + `    Write-Output ('HRESULT=0x{0:X8}' -f $_.Exception.HResult)\n`
        + `    Write-Output ('ERRORID=' + $_.FullyQualifiedErrorId)\n`
        + `    Write-Output ('MESSAGE=' + ($_.Exception.Message -replace '\\r?\\n', ' '))\n`
        + `    exit 1\n`
        + `}\n`
    );

    const devMode = isDeveloperModeEnabled();
    const policyBlocked = isSideloadingBlockedByPolicy();

    if (result.code !== 0) {
        const blocker = classify(result.output);
        logBlock(
            "Packages",
            `Add-AppxPackage failed for ${identity} (exit ${result.code}, blocker ${blocker}, `
            + `developerMode ${devMode}, policyBlocked ${policyBlocked})`,
            result.output
        );
        throw new PackageRegistrationError(blocker, result.output, `Windows refused to register ${identity}.`);
    }

    if (!findRegistration(identity, versionPath)) {
        const blocker = classify(result.output);
        logBlock(
            "Packages",
            `Add-AppxPackage exited 0 but ${identity} is not registered to ${versionPath} `
            + `(blocker ${blocker}, developerMode ${devMode}, policyBlocked ${policyBlocked})`,
            result.output || "(no output)"
        );
        throw new PackageRegistrationError(
            blocker,
            result.output,
            `Windows reported success but ${identity} is still not registered.`
        );
    }

    log("Packages", `Registered ${identity} from ${versionPath}`);
}

export class ElevationDeclinedError extends Error {
    constructor() {
        super("The permission prompt was dismissed.");
        this.name = "ElevationDeclinedError";
    }
}

/**
 * One UAC prompt, one elevated process, both AppModelUnlock values written together. The
 * elevated child cannot pipe its output back through Start-Process, so it writes any failure
 * to a temp file the caller reads - without it a failed repair would be invisible in a log.
 */
export async function enableDeveloperMode(): Promise<void> {
    const reportPath = path.join(os.tmpdir(), `amethyst-devmode-${Date.now()}.txt`);

    const inner =
        `$ErrorActionPreference = 'Stop'\n`
        + `try {\n`
        + `    $key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock'\n`
        + `    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }\n`
        + `    New-ItemProperty -Path $key -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -PropertyType DWord -Force | Out-Null\n`
        + `    New-ItemProperty -Path $key -Name 'AllowAllTrustedApps' -Value 1 -PropertyType DWord -Force | Out-Null\n`
        + `}\n`
        + `catch {\n`
        + `    Set-Content -LiteralPath '${quote(reportPath)}' -Value $_.Exception.Message -Encoding utf8\n`
        + `    exit 1\n`
        + `}\n`;

    const innerEncoded = Buffer.from(inner, "utf16le").toString("base64");

    log("Packages", "Requesting administrator rights to turn on Developer Mode");

    const result = await runPowerShell(
        `$ErrorActionPreference = 'Stop'\n`
        + `try {\n`
        + `    $p = Start-Process -FilePath 'powershell.exe' -ArgumentList `
        + `'-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${innerEncoded}' `
        + `-Verb RunAs -Wait -PassThru\n`
        + `    exit $p.ExitCode\n`
        + `}\n`
        + `catch {\n`
        + `    Write-Output ('LAUNCH=' + ($_.Exception.Message -replace '\\r?\\n', ' '))\n`
        + `    exit 2\n`
        + `}\n`
    );

    let elevatedError = "";
    try {
        elevatedError = fs.readFileSync(reportPath, "utf-8").trim();
        fs.rmSync(reportPath, { force: true });
    } catch {
        // No report file means the elevated step never got far enough to write one.
    }

    if (result.code === 2) {
        logBlock("Packages", "Elevation did not start", result.output);
        // ERROR_CANCELLED from ShellExecute is how a dismissed UAC prompt comes back.
        if (/cancel/i.test(result.output)) throw new ElevationDeclinedError();
        throw new Error(`Windows would not show the permission prompt. ${result.output}`);
    }

    if (result.code !== 0) {
        logBlock("Packages", `Elevated Developer Mode write failed (exit ${result.code})`, elevatedError || result.output);
        throw new Error(`Developer Mode could not be turned on. ${elevatedError || result.output}`);
    }

    if (!isDeveloperModeEnabled()) {
        log("Packages", "Developer Mode still reads as off after the elevated write");
        throw new Error("Developer Mode was set but Windows still reports it as off.");
    }

    log("Packages", "Developer Mode is now on");
}
