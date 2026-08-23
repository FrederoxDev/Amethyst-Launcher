import { log, logBlock } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";
import { describeResult, psQuote, readMarker, runPowerShell } from "@shared/diagnostics/ProcessRunner";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");
const { Buffer } = window.require("buffer") as typeof import("buffer");

type RegeditModule = typeof import("regedit-rs");

const PACKAGES_KEY =
    "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";

const APP_MODEL_UNLOCK_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";
const APPX_POLICY_KEY = "HKLM\\SOFTWARE\\Policies\\Microsoft\\Windows\\Appx";

/** Deployment goes through AppXSvc, which is slow on a cold machine and wedged on a broken one. */
const REGISTER_TIMEOUT_MS = 5 * 60_000;
const UNREGISTER_TIMEOUT_MS = 2 * 60_000;
/** The elevated step waits on a person answering a prompt, so this bounds being ignored, not work. */
const ELEVATION_TIMEOUT_MS = 5 * 60_000;

/** Any Minecraft Bedrock package family, not a fixed list: release, preview, and whatever ships next. */
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
    constructor(
        readonly blocker: RegistrationBlocker,
        readonly detail: string,
        message: string
    ) {
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

/**
 * The one message for a manifest that cannot answer a question about the build. Every caller is
 * on the launch path, where "no <Identity Name>" tells a user nothing they can act on.
 */
function damagedManifest(manifest: string, what: string, cause?: unknown): Error {
    log(
        "Packages",
        `${manifest} could not be read for ${what}: ${describeError(cause ?? "the value is not in the file")}`
    );
    return new Error(
        "This Minecraft version is damaged, so Windows cannot install it.\n\n" +
            "Delete this version in the launcher and download it again.",
        { cause }
    );
}

function readManifest(versionPath: string, what: string): { path: string; xml: string } {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    try {
        return { path: manifest, xml: fs.readFileSync(manifest, "utf-8") };
    } catch (e) {
        throw damagedManifest(manifest, what, e);
    }
}

/** The manifest's `<Application Id>`, the second half of an AUMID. */
export function readApplicationId(versionPath: string): string {
    const manifest = readManifest(versionPath, "its application id");
    const id = manifest.xml.match(/<Application\s+Id="([^"]+)"/)?.[1];
    if (!id) throw damagedManifest(manifest.path, "its application id");
    return id;
}

function regedit(): RegeditModule {
    return window.require("regedit-rs") as RegeditModule;
}

/** `undefined` when the registry could not be read at all, which is not the same as absent. */
function readDword(key: string, name: string): number | null | undefined {
    let listed: ReturnType<RegeditModule["listSync"]>[string];
    try {
        listed = regedit().listSync(key)[key];
    } catch (e) {
        log("Packages", `Could not read ${key} from the registry: ${describeError(e)}`);
        return undefined;
    }

    if (!listed.exists) return null;
    const value = listed.values[name]?.value;
    return typeof value === "number" ? value : null;
}

/**
 * Registering an unpacked build from a loose appxmanifest.xml is a developer operation, so
 * Windows refuses it (HRESULT 0x80073CFF) unless this is set, and it refuses to run what it
 * registered for the same reason. The Settings app writes it when Developer Mode is switched on;
 * it is the single value that differs between a machine where the launcher works and one where
 * registration silently does nothing.
 *
 * `null` when Windows would not answer, which must never be read as "off": a launch stopped over
 * an unanswered question is a dead end, while a launch that carries on gets a real answer out of
 * whichever step Windows refuses next.
 */
export function readDeveloperMode(): boolean | null {
    const value = readDword(APP_MODEL_UNLOCK_KEY, "AllowDevelopmentWithoutDevLicense");
    return value === undefined ? null : value === 1;
}

/**
 * Group policy or an MDM/Intune profile overrides AppModelUnlock. When it does, writing
 * AppModelUnlock ourselves is pointless: the policy wins and gets re-applied. This is the
 * one cause the launcher genuinely cannot repair.
 */
export function readSideloadingPolicyBlock(): boolean | null {
    const allTrusted = readDword(APPX_POLICY_KEY, "AllowAllTrustedApps");
    const withoutLicense = readDword(APPX_POLICY_KEY, "AllowDevelopmentWithoutDevLicense");
    if (allTrusted === undefined || withoutLicense === undefined) return null;
    return allTrusted === 0 || withoutLicense === 0;
}

/** A setting Windows would not report reads as unknown, never as the safe-looking answer. */
function settingText(value: boolean | null): string {
    return value === null ? "unknown" : String(value);
}

/** The package family a build registers as, read from the build itself. */
export function readIdentityName(versionPath: string): string {
    const manifest = readManifest(versionPath, "which Minecraft it is");
    const match = manifest.xml.match(/<Identity\s+Name="([^"]+)"/);
    if (!match) throw damagedManifest(manifest.path, "which Minecraft it is");
    return match[1];
}

/**
 * One unreadable entry is not an answer about the rest of them, and every caller is on the launch
 * path, where an entry Windows half-wrote is a reason to register again rather than a reason to
 * stop. A skipped entry costs a registration that turns out to be unnecessary; a thrown one costs
 * the launch, with a line of registry path where a user needs something to do.
 */
export function listRegistered(): RegisteredPackage[] {
    const listed = regedit().listSync(PACKAGES_KEY);
    if (!listed[PACKAGES_KEY].exists) return [];

    const out: RegisteredPackage[] = [];
    for (const key of listed[PACKAGES_KEY].keys) {
        if (!key.toLowerCase().startsWith(MINECRAFT_FAMILY_PREFIX)) continue;

        const fullKey = `${PACKAGES_KEY}\\${key}`;
        let installPath: string | undefined;
        try {
            const values = regedit().listSync(fullKey)[fullKey];
            installPath = values.exists ? (values.values["PackageRootFolder"]?.value as string | undefined) : undefined;
        } catch (e) {
            log("Packages", `Skipping ${fullKey}, which could not be read: ${describeError(e)}`);
            continue;
        }

        if (!installPath) {
            log("Packages", `Skipping ${fullKey}, which holds no PackageRootFolder to register from`);
            continue;
        }

        try {
            out.push({ family: key.split("_")[0], familyName: familyNameFrom(key), installPath });
        } catch (e) {
            log("Packages", `Skipping ${fullKey}, whose name is not shaped like a package: ${describeError(e)}`);
        }
    }
    return out;
}

export function samePath(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

/** `undefined` when the registry would not say, which is not the same as nothing being registered. */
function registrationsFor(family: string): RegisteredPackage[] | undefined {
    const wanted = family.toLowerCase();
    try {
        return listRegistered().filter(pkg => pkg.family.toLowerCase() === wanted);
    } catch (e) {
        log("Packages", `Could not read which packages are registered as ${family}: ${describeError(e)}`);
        return undefined;
    }
}

/** The registration `activate()` will later look for, so this is exactly the postcondition that matters. */
function findRegistration(identity: string, versionPath: string): RegisteredPackage | null | undefined {
    const matches = registrationsFor(identity);
    if (matches === undefined) return undefined;
    return matches.find(pkg => samePath(pkg.installPath, versionPath)) ?? null;
}

/**
 * The codes Windows returns for the refusals this launcher can act on, both as the HRESULT the
 * error carries and as the signed integer the same value reads as. Codes rather than wording,
 * because the wording is translated: on a non-English Windows the substring pass below matches
 * nothing, every refusal came back "unknown", and the repair that would have fixed it was skipped.
 */
const BLOCKER_BY_CODE: [string, RegistrationBlocker][] = [
    ["0X80073D02", "package-in-use"],
    ["-2147009278", "package-in-use"],
    ["0X80073CFF", "developer-mode"],
    ["-2147009281", "developer-mode"],
    ["0X80073CFB", "conflicting-registration"],
    ["-2147009285", "conflicting-registration"],
    ["0X80073D06", "conflicting-registration"],
    ["-2147009274", "conflicting-registration"],
    ["0X80073CF6", "conflicting-registration"],
    ["-2147009290", "conflicting-registration"],
];

function codedBlocker(output: string): RegistrationBlocker | null {
    const upper = output.toUpperCase();
    return BLOCKER_BY_CODE.find(([code]) => upper.includes(code))?.[1] ?? null;
}

/**
 * A registry read that failed says nothing about Developer Mode, so only an answer of `false`
 * blames it. Reading an unanswered question as "off" sent the user round the permission prompt
 * for a setting that was never the problem, forever.
 */
function classify(output: string): RegistrationBlocker {
    const coded = codedBlocker(output);

    // Unambiguous enough to outrank the registry checks, and true regardless of them.
    if (coded === "package-in-use") return coded;

    if (readSideloadingPolicyBlock() === true) return "sideloading-policy";
    if (readDeveloperMode() === false) return "developer-mode";
    if (coded !== null) return coded;

    // Last resort: an English-language Windows saying in words what it did not say in codes.
    const text = output.toLowerCase();
    if (text.includes("need to be closed") || text.includes("currently in use")) return "package-in-use";
    if (text.includes("developer license") || text.includes("sideload")) return "developer-mode";
    if (text.includes("already exists") || text.includes("already installed")) return "conflicting-registration";
    return "unknown";
}

/**
 * An empty `Get-AppxPackage` pipeline removes nothing and still exits 0, and the registry the
 * rest of this module reads outlives a half-removed package, so the removal is read back rather
 * than trusted - exactly as `register` reads its own registration back.
 */
export async function unregister(family: string): Promise<void> {
    const result = await runPowerShell(
        `Get-AppxPackage '${psQuote(family)}' | Remove-AppxPackage -PreserveRoamableApplicationData -ErrorAction Stop`,
        { timeoutMs: UNREGISTER_TIMEOUT_MS }
    );

    if (result.code !== 0) {
        logBlock("Packages", `Unregister ${family} failed`, describeResult(result));
        throw new Error(`Could not remove the existing ${family} registration. ${result.output}`);
    }

    const remaining = registrationsFor(family);
    if (remaining === undefined) {
        log("Packages", `Removed ${family}, though the registry would not confirm it is gone`);
        return;
    }

    if (remaining.length > 0) {
        const listed = remaining.map(pkg => pkg.installPath).join("; ");
        logBlock("Packages", `Remove-AppxPackage reported success but ${family} is still registered`, listed);
        throw new Error(`Windows reported that ${family} was removed, but it is still registered at ${listed}.`);
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

    // The inner catch adds the two locale-invariant fields the shared wrapper does not carry,
    // then rethrows so the wrapper still writes the HRESULT and the message alongside them.
    const result = await runPowerShell(
        `try {\n` +
            `    Add-AppxPackage -Path '${psQuote(manifest)}' -Register -ErrorAction Stop\n` +
            `}\n` +
            `catch {\n` +
            `    Write-Output ('NATIVEERROR=' + $_.Exception.NativeErrorCode)\n` +
            `    Write-Output ('APPXERRORID=' + $_.FullyQualifiedErrorId)\n` +
            `    throw\n` +
            `}`,
        { timeoutMs: REGISTER_TIMEOUT_MS }
    );

    const settings =
        `developerMode ${settingText(readDeveloperMode())}, ` +
        `policyBlocked ${settingText(readSideloadingPolicyBlock())}`;

    if (result.code !== 0) {
        const blocker = classify(result.output);
        logBlock(
            "Packages",
            `Add-AppxPackage failed for ${identity} (blocker ${blocker}, ${settings})`,
            describeResult(result)
        );
        throw new PackageRegistrationError(
            blocker,
            describeResult(result),
            result.timedOut
                ? `Windows never finished registering ${identity}.`
                : `Windows refused to register ${identity}.`
        );
    }

    const registration = findRegistration(identity, versionPath);

    if (registration === undefined) {
        log("Packages", `Registered ${identity} from ${versionPath}, though the registry would not confirm it`);
        return;
    }

    if (registration === null) {
        const blocker = classify(result.output);
        logBlock(
            "Packages",
            `Add-AppxPackage exited 0 but ${identity} is not registered to ${versionPath} ` +
                `(blocker ${blocker}, ${settings})`,
            describeResult(result)
        );
        throw new PackageRegistrationError(
            blocker,
            describeResult(result),
            `Windows reported success but ${identity} is still not registered.`
        );
    }

    log("Packages", `Registered ${identity} from ${versionPath}`);
}

/** The manual route, so a refused or broken permission prompt is never the end of the road. */
const DEVELOPER_MODE_BY_HAND =
    "You can turn it on yourself instead: open Settings, then System, then For developers, and turn on " +
    "Developer Mode. Then come back and press Play.";

export class ElevationDeclinedError extends Error {
    constructor() {
        super(
            "Developer Mode was not turned on, because the Windows permission prompt was dismissed.\n\n" +
                `Press Play again and choose Yes. ${DEVELOPER_MODE_BY_HAND}`
        );
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
        `$ErrorActionPreference = 'Stop'\n` +
        `try {\n` +
        `    $key = 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock'\n` +
        `    if (-not (Test-Path $key)) { New-Item -Path $key -Force | Out-Null }\n` +
        `    New-ItemProperty -Path $key -Name 'AllowDevelopmentWithoutDevLicense' -Value 1 -PropertyType DWord -Force | Out-Null\n` +
        `    New-ItemProperty -Path $key -Name 'AllowAllTrustedApps' -Value 1 -PropertyType DWord -Force | Out-Null\n` +
        `}\n` +
        `catch {\n` +
        `    Set-Content -LiteralPath '${psQuote(reportPath)}' -Value $_.Exception.Message -Encoding utf8\n` +
        `    exit 1\n` +
        `}\n`;

    const innerEncoded = Buffer.from(inner, "utf16le").toString("base64");

    log("Packages", "Requesting administrator rights to turn on Developer Mode");

    // The marker separates "the prompt never appeared" from "the elevated script failed": both
    // exit non-zero, and only the first of them is something the user just declined.
    const result = await runPowerShell(
        `$p = Start-Process -FilePath 'powershell.exe' -ArgumentList ` +
            `'-NoProfile','-ExecutionPolicy','Bypass','-EncodedCommand','${innerEncoded}' ` +
            `-Verb RunAs -Wait -PassThru\n` +
            `Write-Output ('ELEVATED=' + $p.ExitCode)\n` +
            `exit $p.ExitCode`,
        { timeoutMs: ELEVATION_TIMEOUT_MS }
    );

    let elevatedError = "";
    try {
        elevatedError = fs.readFileSync(reportPath, "utf-8").trim();
        fs.rmSync(reportPath, { force: true });
    } catch {
        // No report file means the elevated step never got far enough to write one.
    }

    if (readMarker(result.output, "ELEVATED") === null) {
        logBlock("Packages", "Elevation did not start", describeResult(result));
        if (declinedElevation(result.output)) throw new ElevationDeclinedError();
        throw new Error(`Windows would not show the permission prompt.\n\n${DEVELOPER_MODE_BY_HAND}`);
    }

    if (result.code !== 0) {
        logBlock(
            "Packages",
            `Elevated Developer Mode write failed (exit ${result.code})`,
            elevatedError || describeResult(result)
        );
        throw new Error(`Developer Mode could not be turned on.\n\n${DEVELOPER_MODE_BY_HAND}`);
    }

    const developerMode = readDeveloperMode();

    if (developerMode === false) {
        log("Packages", "Developer Mode still reads as off after the elevated write");
        throw new Error(
            "Developer Mode was turned on but Windows still reports it as off.\n\n" +
                "Restart the computer and press Play again."
        );
    }

    if (developerMode === null) {
        log(
            "Packages",
            "Windows would not say whether Developer Mode is on after the elevated write, so the launch carries " +
                "on and lets registration give the real answer"
        );
        return;
    }

    log("Packages", "Developer Mode is now on");
}

/** ERROR_CANCELLED, which is how a dismissed UAC prompt comes back, by code before by wording. */
function declinedElevation(output: string): boolean {
    if (output.toUpperCase().includes("0X800704C7") || /(^|\D)1223(\D|$)/.test(output)) return true;
    return /cancel/i.test(output);
}
