import { Channel } from "@renderer/scripts/domain/Channel";

const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

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

function exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child.exec(command, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout);
        });
    });
}

/** Strips the manifest bits that block loose registration, returning the effective XML. */
function patchManifest(versionPath: string): string {
    const manifestPath = path.join(versionPath, "appxmanifest.xml");
    const original = fs.readFileSync(manifestPath, "utf-8");

    const patched = original
        .replace(/<desktop6:Extension\s+Category="windows\.customInstall"[\s\S]*?<\/desktop6:Extension>\s*/g, "")
        .replace(/<rescap:Capability\s+Name="customInstallActions"\s*\/>\s*/g, "")
        .replace(/<Extensions>\s*<\/Extensions>\s*/g, "");

    if (patched !== original) {
        fs.writeFileSync(manifestPath, patched, "utf-8");
        console.log("[VersionFiles] Stripped customInstall from manifest");
    }
    return patched;
}

function ensureManifestAssets(versionPath: string, manifestXml: string): void {
    const seen = new Set<string>();
    for (const match of manifestXml.match(/(?:Logo|Image)="([^"]+\.png)"/gi) ?? []) {
        const file = match.match(/"([^"]+\.png)"/i)?.[1];
        if (!file || seen.has(file)) continue;
        seen.add(file);

        const full = path.join(versionPath, file);
        if (!fs.existsSync(full)) {
            fs.writeFileSync(full, PLACEHOLDER_PNG);
            console.log("[VersionFiles] Created placeholder asset:", file);
        }
    }
}

/** GDK builds refuse to launch without this next to the exe. */
function ensureGameConfig(versionPath: string, manifestXml: string, channel: Channel): void {
    const configPath = path.join(versionPath, "MicrosoftGame.Config");
    if (fs.existsSync(configPath)) return;

    const identity = manifestXml.match(/<Identity\s+Name="([^"]+)"\s+Publisher="([^"]+)"\s+Version="([^"]+)"/);
    if (!identity) throw new Error(`${versionPath}: appxmanifest.xml has no usable <Identity>`);
    const [, packageName, publisher, version] = identity;
    const ids = CHANNEL_IDS[channel];

    // Prefer the build's own title id over our per-channel default.
    const titleId = manifestXml.match(/Protocol\s+Name="ms-xbl-([0-9a-fA-F]+)"/)?.[1].toUpperCase() ?? ids.titleId;

    const languages = new Set<string>();
    for (const m of manifestXml.match(/Language="([a-z]{2}-[a-z]{2})"/gi) ?? []) {
        const lang = m.match(/"([^"]+)"/)?.[1];
        if (lang) languages.add(lang.toLowerCase());
    }
    if (languages.size === 0) languages.add("en-us");

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

    fs.writeFileSync(configPath, config, "utf-8");
    console.log("[VersionFiles] Generated MicrosoftGame.Config");
}

/**
 * The redist's own DLL is the thing the game loads, so its presence is the state worth
 * reading. Not the MSI's ProductCode: the MSI no-ops (exit 0, ~1.1s) when a compatible
 * GameInput is already present without ever registering itself, so a ProductCode check
 * would reinstall on every launch. Versions aren't comparable either — the DLL reports
 * 3.3.221.0 against the MSI's 10.1.26100.6106.
 */
function isGameInputInstalled(): boolean {
    const systemRoot = process.env.SystemRoot ?? "C:\\Windows";
    return fs.existsSync(path.join(systemRoot, "System32", "GameInputRedist.dll"));
}

async function ensureGameInput(versionPath: string, status: (message: string) => void): Promise<void> {
    if (isGameInputInstalled()) return;

    const msi = path.join(versionPath, "Installers", "GameInputRedist.msi");
    if (!fs.existsSync(msi)) throw new Error(`GameInput is not installed and ${msi} is missing.`);

    status("Installing GameInput...");
    try {
        await exec(`msiexec /i "${msi}" /quiet /norestart`);
    } catch (e) {
        throw new Error(
            `GameInput could not be installed from ${msi}. Try running the launcher as administrator. (${e})`
        );
    }

    if (!isGameInputInstalled()) {
        throw new Error(`GameInput reported a successful install but ${msi} did not provide GameInputRedist.dll.`);
    }
    console.log("[VersionFiles] GameInput installed");
}

/** Idempotent; safe to run before every launch. */
export async function ensureVersionFiles(
    versionPath: string,
    channel: Channel,
    onStatus?: (message: string) => void
): Promise<void> {
    const status = onStatus ?? (() => {});

    status("Patching manifest...");
    const manifestXml = patchManifest(versionPath);
    ensureManifestAssets(versionPath, manifestXml);

    status("Generating game config...");
    ensureGameConfig(versionPath, manifestXml, channel);

    await ensureGameInput(versionPath, status);
}

export function proxyDllPath(versionPath: string): string {
    return path.join(versionPath, "dxgi.dll");
}

export function sourceProxyDllPath(): string {
    const base = import.meta.env.DEV ? path.join(process.cwd(), "resources") : process.resourcesPath;
    return path.join(base, "proxy", "dxgi.dll");
}

export function isProxyPresent(versionPath: string): boolean {
    return fs.existsSync(proxyDllPath(versionPath));
}

export function setProxyPresent(versionPath: string, present: boolean): void {
    const target = proxyDllPath(versionPath);

    if (!present) {
        fs.rmSync(target, { force: true });
        return;
    }

    const source = sourceProxyDllPath();
    if (!fs.existsSync(source)) {
        throw new Error(`Proxy dxgi.dll not found at ${source}. Build the proxy before launching a modded profile.`);
    }
    fs.copyFileSync(source, target);
}
