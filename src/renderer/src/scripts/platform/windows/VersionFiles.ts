import { Channel } from "@renderer/scripts/domain/Channel";
import { log } from "@renderer/scripts/LauncherLog";
import { describeResult, run } from "@shared/diagnostics/ProcessRunner";
import { classifyBuild } from "./LaunchDiagnostics";
import { PRELOAD_DLL } from "./Preload";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

const MSI_TIMEOUT_MS = 10 * 60_000;
/** msiexec's "installed, but Windows wants a reboot". Still an install. */
const MSI_REBOOT_REQUIRED = 3010;

/** 1x1 transparent PNG, for manifest-referenced assets the msixvc doesn't ship. */
const PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQABNl7BcQAAAABJRU5ErkJggg==",
    "base64"
);

const CHANNEL_IDS: Record<Channel, { displayName: string; protocol: string; titleId: string; storeId: string; msaAppId: string }> = {
    release: {
        displayName: "Minecraft for Windows",
        protocol: "minecraft",
        titleId: "35760C07",
        storeId: "9NBLGGH2JHXJ",
        msaAppId: "0000000040159362",
    },
    preview: {
        displayName: "Minecraft Preview for Windows",
        protocol: "minecraft-preview",
        titleId: "717D695F",
        storeId: "9P5X4QVLC2XR",
        msaAppId: "00000000403FC600",
    },
};

/** Message plus errno, because the code is what says whether a write failure is repairable. */
function describe(e: unknown): string {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : null;
    const message = e instanceof Error ? e.message : String(e);
    return code ? `${message} (${code})` : message;
}

/** Strips the manifest bits that block loose registration, returning the effective XML. */
function patchManifest(versionPath: string): string {
    const manifestPath = path.join(versionPath, "appxmanifest.xml");

    let original: string;
    try {
        original = fs.readFileSync(manifestPath, "utf-8");
    } catch (e) {
        log("VersionFiles", `Could not read ${manifestPath}: ${describe(e)}`);
        throw new Error(
            `This Minecraft version cannot be prepared because its manifest could not be read.\n\n`
            + `${manifestPath} (${describe(e)})`,
            { cause: e }
        );
    }

    const patched = original
        .replace(/<desktop6:Extension\s+Category="windows\.customInstall"[\s\S]*?<\/desktop6:Extension>\s*/g, "")
        .replace(/<rescap:Capability\s+Name="customInstallActions"\s*\/>\s*/g, "")
        .replace(/<Extensions>\s*<\/Extensions>\s*/g, "");

    if (patched === original) {
        log("VersionFiles", `${manifestPath} already has no customInstall, left as is (${original.length} chars)`);
        return patched;
    }

    try {
        fs.writeFileSync(manifestPath, patched, "utf-8");
    } catch (e) {
        log("VersionFiles", `Could not write the patched ${manifestPath}: ${describe(e)}`);
        throw new Error(
            `This Minecraft version cannot be prepared because its manifest could not be written.\n\n`
            + `${manifestPath} (${describe(e)})`,
            { cause: e }
        );
    }
    log(
        "VersionFiles",
        `Stripped customInstall from ${manifestPath} (${original.length} chars to ${patched.length})`
    );
    return patched;
}

function ensureManifestAssets(versionPath: string, manifestXml: string): void {
    const seen = new Set<string>();
    const created: string[] = [];

    for (const match of manifestXml.match(/(?:Logo|Image)="([^"]+\.png)"/gi) ?? []) {
        const file = match.match(/"([^"]+\.png)"/i)?.[1];
        if (!file || seen.has(file)) continue;
        seen.add(file);

        const full = path.join(versionPath, file);
        if (fs.existsSync(full)) continue;

        try {
            fs.mkdirSync(path.dirname(full), { recursive: true });
            fs.writeFileSync(full, PLACEHOLDER_PNG);
        } catch (e) {
            log("VersionFiles", `Could not create the placeholder asset ${full}: ${describe(e)}`);
            throw new Error(
                `This Minecraft version cannot be prepared because an image it lists could not be created.\n\n`
                + `${full} (${describe(e)})`,
                { cause: e }
            );
        }
        created.push(file);
    }

    log(
        "VersionFiles",
        created.length === 0
            ? `All ${seen.size} manifest images are present in ${versionPath}`
            : `Created ${created.length} of ${seen.size} manifest images as placeholders: ${created.join(", ")}`
    );
}

/** Size and mtime, which is what says whether a file is this launcher's or came with the build. */
function describeFile(filePath: string): string {
    try {
        const stat = fs.statSync(filePath);
        return `${stat.size} bytes, written ${stat.mtime.toISOString()}`;
    } catch (e) {
        return `unreadable: ${describe(e)}`;
    }
}

/** GDK builds refuse to launch without this next to the exe. */
function ensureGameConfig(versionPath: string, manifestXml: string, channel: Channel): void {
    const configPath = path.join(versionPath, "MicrosoftGame.Config");
    if (fs.existsSync(configPath)) {
        log("VersionFiles", `MicrosoftGame.Config already present, left as is: ${configPath} (${describeFile(configPath)})`);
        return;
    }

    const identity = manifestXml.match(/<Identity\s+Name="([^"]+)"\s+Publisher="([^"]+)"\s+Version="([^"]+)"/);
    if (!identity) {
        log("VersionFiles", `No usable <Identity> in the manifest at ${versionPath}, cannot generate MicrosoftGame.Config`);
        throw new Error(`${versionPath}: appxmanifest.xml has no usable <Identity>`);
    }
    const [, packageName, publisher, version] = identity;
    const ids = CHANNEL_IDS[channel];

    // Prefer the build's own title id over our per-channel default.
    const buildTitleId = manifestXml.match(/Protocol\s+Name="ms-xbl-([0-9a-fA-F]+)"/)?.[1].toUpperCase() ?? null;
    const titleId = buildTitleId ?? ids.titleId;

    const languages = new Set<string>();
    for (const m of manifestXml.match(/Language="([a-z]{2}-[a-z]{2})"/gi) ?? []) {
        const lang = m.match(/"([^"]+)"/)?.[1];
        if (lang) languages.add(lang.toLowerCase());
    }
    if (languages.size === 0) {
        languages.add("en-us");
        log("VersionFiles", "Manifest lists no languages, falling back to en-us");
    }

    log(
        "VersionFiles",
        `Generating MicrosoftGame.Config for ${channel}: identity ${packageName} ${version} by ${publisher}, `
        + `title id ${titleId} (${buildTitleId ? "from the build" : `from the ${channel} default`}), `
        + `${languages.size} languages`
    );

    const config = `<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">

  <Identity Name="${packageName}"
            Publisher="${publisher}"
            Version="${version}" />

  <TitleId>${titleId}</TitleId>
  <MSAAppId>${ids.msaAppId}</MSAAppId>
  <StoreId>${ids.storeId}</StoreId>

  <ShellVisuals DefaultDisplayName="${ids.displayName}"
      PublisherDisplayName="Microsoft Studios"
      StoreLogo="StoreLogo.png"
      Square150x150Logo="Logo.png"
      Square44x44Logo="SmallLogo.png"
      Description="Minecraft"
      ForegroundText="light"
      BackgroundColor="#EF323D"
      SplashScreenImage="MCSplashScreen.png"
      Square480x480Logo="LargeLogo.png"/>

  <Resources>
${[...languages].map(l => `    <Resource Language="${l}"/>`).join("\n")}
  </Resources>

  <ExecutableList>
    <Executable Name="Minecraft.Windows.exe"
                TargetDeviceFamily="PC"
                Id="Game" />
  </ExecutableList>

  <ProtocolList>
    <Protocol Name="${ids.protocol}"/>
  </ProtocolList>

  <AdvancedUserModel>true</AdvancedUserModel>

  <MSAFullTrust>true</MSAFullTrust>

  <DesktopRegistration>
    <MultiplayerProtocol>true</MultiplayerProtocol>
    <DependencyList>
      <KnownDependency Name="VC14" />
    </DependencyList>
    <FileTypeAssociation Name="minecraftfiles" Executable="Minecraft.Windows.exe">
      <DisplayName>Minecraft Supported File</DisplayName>
      <EditFlags OpenIsSafe="true" AlwaysUnsafe="false" />
      <InfoTip>Import this file into your Local Minecraft Installation</InfoTip>
      <SupportedFileTypes>
        <FileType>.mcpack</FileType>
        <FileType>.mcworld</FileType>
        <FileType>.mcperf</FileType>
        <FileType>.mcshortcut</FileType>
        <FileType>.mcproject</FileType>
        <FileType>.mctemplate</FileType>
        <FileType>.mcaddon</FileType>
        <FileType>.mceditoraddon</FileType>
      </SupportedFileTypes>
    </FileTypeAssociation>
    <CustomInstallActions>
      <Folder>Installers</Folder>
      <InstallActionList>
        <InstallAction Name="GameInput_" File="GameInputRedist.msi" />
      </InstallActionList>
    </CustomInstallActions>
  </DesktopRegistration>

</Game>`;

    try {
        fs.writeFileSync(configPath, config, "utf-8");
    } catch (e) {
        log("VersionFiles", `Could not write ${configPath}: ${describe(e)}`);
        throw new Error(
            `This Minecraft version cannot be prepared because its game config could not be written.\n\n`
            + `${configPath} (${describe(e)})`,
            { cause: e }
        );
    }
    log("VersionFiles", `Wrote ${configPath} (${config.length} chars)`);
}

export const GAME_EXECUTABLE = "Minecraft.Windows.exe";

/**
 * The files a launch stands or falls on, so a half-extracted build is visible in its own right.
 * The preload DLL is listed because a patched build cannot start without it, and the retired
 * dxgi proxy because one left behind says which launcher version last prepared this folder.
 */
export function describePayload(versionPath: string): string {
    const describe = (name: string): string => {
        try {
            return `${name} ${fs.statSync(path.join(versionPath, name)).size} bytes`;
        } catch {
            return `${name} absent`;
        }
    };
    return [describe(GAME_EXECUTABLE), describe("appxmanifest.xml"), describe(PRELOAD_DLL), describe("dxgi.dll")]
        .join(", ");
}

/**
 * Nothing downstream reads the build folder before Windows is asked to run it, so an interrupted
 * extraction or a file an antivirus took away surfaced as a silent do-nothing activation. Both
 * files matter: the game is what runs, and the manifest is what Windows registers and what every
 * package family and app id is read out of.
 */
export function assertBuildUsable(versionPath: string): void {
    const verdict = classifyBuild({
        folderExists: fs.existsSync(versionPath),
        gameExecutable: fs.existsSync(path.join(versionPath, GAME_EXECUTABLE)),
        manifest: fs.existsSync(path.join(versionPath, "appxmanifest.xml")),
    });

    if (verdict.kind === "usable") return;

    log(
        "VersionFiles",
        `${versionPath} is not usable (${verdict.kind}). Folder holds: ${describePayload(versionPath)}`
    );
    throw new Error(`${verdict.headline}\n\n${verdict.nextStep}`);
}

/**
 * The redist's own DLL is the thing the game loads, so its presence is the state worth
 * reading. Not the MSI's ProductCode: the MSI no-ops (exit 0, ~1.1s) when a compatible
 * GameInput is already present without ever registering itself, so a ProductCode check
 * would reinstall on every launch. Versions aren't comparable either - the DLL reports
 * 3.3.221.0 against the MSI's 10.1.26100.6106.
 */
function gameInputDllPath(): string {
    return path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "GameInputRedist.dll");
}

function isGameInputInstalled(): boolean {
    return fs.existsSync(gameInputDllPath());
}

async function ensureGameInput(versionPath: string, status: (message: string) => void): Promise<void> {
    if (isGameInputInstalled()) {
        log("VersionFiles", `GameInput already installed, skipping: ${gameInputDllPath()} (${describeFile(gameInputDllPath())})`);
        return;
    }

    const msi = path.join(versionPath, "Installers", "GameInputRedist.msi");
    if (!fs.existsSync(msi)) {
        log("VersionFiles", `GameInputRedist.dll is absent from System32 and the installer ${msi} is missing too`);
        throw new Error(`GameInput is not installed and ${msi} is missing.`);
    }

    log("VersionFiles", `GameInputRedist.dll is absent from System32, installing from ${msi} (${describeFile(msi)})`);
    status("Installing GameInput...");
    const result = await run("msiexec", ["/i", msi, "/quiet", "/norestart"], { timeoutMs: MSI_TIMEOUT_MS });

    if (result.code !== 0 && result.code !== MSI_REBOOT_REQUIRED) {
        log("VersionFiles", `GameInput install failed.\n${describeResult(result)}`);
        throw new Error(
            `GameInput could not be installed from ${msi}. Try running the launcher as administrator. `
            + `(${result.timedOut ? "the installer never finished" : `installer result ${result.code}`})`
        );
    }

    if (!isGameInputInstalled()) {
        log("VersionFiles", `msiexec reported ${result.code} but GameInputRedist.dll is still absent.`);
        throw new Error(`GameInput reported a successful install but ${msi} did not provide GameInputRedist.dll.`);
    }
    log("VersionFiles", `GameInput installed (msiexec result ${result.code})`);
}

/** Idempotent; safe to run before every launch. */
export async function ensureVersionFiles(
    versionPath: string,
    channel: Channel,
    onStatus?: (message: string) => void
): Promise<void> {
    const status = onStatus ?? (() => {});

    log("VersionFiles", `Preparing the ${channel} build at ${versionPath}`);
    assertBuildUsable(versionPath);
    log("VersionFiles", `Build at ${versionPath}: ${describePayload(versionPath)}`);

    status("Patching manifest...");
    const manifestXml = patchManifest(versionPath);
    ensureManifestAssets(versionPath, manifestXml);

    status("Generating game config...");
    ensureGameConfig(versionPath, manifestXml, channel);

    await ensureGameInput(versionPath, status);
    log("VersionFiles", `The ${channel} build at ${versionPath} is ready to register`);
}
