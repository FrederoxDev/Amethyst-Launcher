import { InstalledVersionModel } from "./VersionManager";
import { Profile } from "./Profiles";

const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

type RegeditModule = typeof import("regedit-rs");

function getRegedit(): RegeditModule {
    return window.require("regedit-rs") as RegeditModule;
}

const PACKAGES_REG_KEY =
    "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";

export function GetPackage() {
    const regedit = getRegedit();
    const listed = regedit.listSync(PACKAGES_REG_KEY);
    if (!listed[PACKAGES_REG_KEY].exists) return undefined;

    const minecraftKey = listed[PACKAGES_REG_KEY].keys.find(
        key => key.toLowerCase().startsWith("microsoft.minecraftuwp_")
    );
    if (minecraftKey === undefined) return undefined;

    const fullKey = `${PACKAGES_REG_KEY}\\${minecraftKey}`;
    const minecraftValues = regedit.listSync(fullKey)[fullKey];
    if (!minecraftValues.exists) return undefined;

    return minecraftValues;
}

export function GetPackageID(): string | undefined {
    return GetPackage()?.values["PackageID"].value as string | undefined;
}

export function GetPackagePath(): string | undefined {
    return GetPackage()?.values["PackageRootFolder"].value as string | undefined;
}

export function IsRegistered(version: InstalledVersionModel): boolean {
    const packagePath = GetPackagePath();
    if (!packagePath) return false;
    return path.resolve(packagePath) === path.resolve(version.path);
}

function execCommand(command: string): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        child.exec(command, (error, stdout, stderr) => {
            if (error) {
                reject(new Error(`${stderr || error.message}`));
                return;
            }
            resolve(stdout);
        });
    });
}

export async function UnregisterCurrent(): Promise<void> {
    // Use Get-AppxPackage directly — more reliable than registry lookup
    // since the package name casing can vary
    const cmd = `powershell -ExecutionPolicy Bypass -Command "& { Get-AppxPackage Microsoft.MinecraftUWP | Remove-AppxPackage -PreserveRoamableApplicationData }"`;
    await execCommand(cmd);
    console.log("[AppRegistry] Unregistered Minecraft UWP package");
}

/**
 * Strips elements from the AppxManifest that prevent loose registration
 * (e.g. desktop6:customInstall extension and customInstallActions capability).
 */
/** Minimal 1x1 transparent PNG (68 bytes). */
const PLACEHOLDER_PNG = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVQI12NgAAIABQAB" +
    "Nl7BcQAAAABJRU5ErkJggg==",
    "base64"
);

/**
 * Ensures all image assets referenced in the manifest exist.
 * Creates 1x1 transparent PNGs for any missing files.
 */
function ensureManifestAssets(versionPath: string, manifestXml: string): void {
    const imageRefs = manifestXml.match(/(?:Logo|Image)="([^"]+\.png)"/gi) ?? [];
    const seen = new Set<string>();

    for (const match of imageRefs) {
        const file = match.match(/"([^"]+\.png)"/i)?.[1];
        if (!file || seen.has(file)) continue;
        seen.add(file);

        const fullPath = path.join(versionPath, file);
        if (!fs.existsSync(fullPath)) {
            fs.writeFileSync(fullPath, PLACEHOLDER_PNG);
            console.log("[AppRegistry] Created placeholder asset:", file);
        }
    }
}

function patchManifest(manifestPath: string, versionPath: string): void {
    let xml = fs.readFileSync(manifestPath, "utf-8");
    const original = xml;

    // Remove the desktop6:Extension block for customInstall
    xml = xml.replace(/<desktop6:Extension\s+Category="windows\.customInstall"[\s\S]*?<\/desktop6:Extension>\s*/g, "");

    // Remove the customInstallActions capability
    xml = xml.replace(/<rescap:Capability\s+Name="customInstallActions"\s*\/>\s*/g, "");

    // Clean up empty <Extensions> block if left behind
    xml = xml.replace(/<Extensions>\s*<\/Extensions>\s*/g, "");

    if (xml !== original) {
        fs.writeFileSync(manifestPath, xml, "utf-8");
        console.log("[AppRegistry] Patched manifest: stripped customInstall extensions");
    }

    // Ensure all referenced image assets exist
    ensureManifestAssets(versionPath, xml);
}

/**
 * Generates a MicrosoftGame.Config file from the AppxManifest if one doesn't exist.
 * GDK games require this file to launch properly.
 */
function ensureMicrosoftGameConfig(versionPath: string, manifestXml: string): void {
    const configPath = path.join(versionPath, "MicrosoftGame.Config");
    if (fs.existsSync(configPath)) return;

    // Extract identity info from manifest
    const identityMatch = manifestXml.match(/<Identity\s+Name="([^"]+)"\s+Publisher="([^"]+)"\s+Version="([^"]+)"/);
    if (!identityMatch) {
        console.warn("[AppRegistry] Could not extract Identity from manifest for MicrosoftGame.Config");
        return;
    }

    const [, packageName, publisher, version] = identityMatch;

    // Determine if this is preview or release
    const isPreview = packageName.toLowerCase().includes("beta") || packageName.toLowerCase().includes("preview");
    const displayName = isPreview ? "Minecraft Preview for Windows" : "Minecraft for Windows";
    const protocolName = isPreview ? "minecraft-preview" : "minecraft";

    // Extract TitleId from protocol name (ms-xbl-XXXXXXXX pattern)
    const titleIdMatch = manifestXml.match(/Protocol\s+Name="ms-xbl-([0-9a-fA-F]+)"/);
    const titleId = titleIdMatch ? titleIdMatch[1].toUpperCase() : (isPreview ? "717D695F" : "35760C07");

    // StoreId and MSAAppId for release vs preview
    const storeId = isPreview ? "9P5X4QVLC2XR" : "9NBLGGH2JHXJ";
    const msaAppId = isPreview ? "00000000403FC600" : "0000000040159362";

    // Extract resource languages from the manifest
    const langMatches = manifestXml.match(/Language="([a-z]{2}-[a-z]{2})"/gi) ?? [];
    const languages = new Set<string>();
    for (const m of langMatches) {
        const lang = m.match(/"([^"]+)"/)?.[1];
        if (lang) languages.add(lang.toLowerCase());
    }
    // Fallback if no languages found in manifest
    if (languages.size === 0) languages.add("en-us");

    const resourceLines = [...languages].map(l => `    <Resource Language="${l}"/>`).join("\n");

    const config = `<?xml version="1.0" encoding="utf-8"?>
<Game configVersion="1">

  <Identity Name="${packageName}"
            Publisher="${publisher}"
            Version="${version}" />

  <TitleId>${titleId}</TitleId>
  <MSAAppId>${msaAppId}</MSAAppId>
  <StoreId>${storeId}</StoreId>

  <ShellVisuals DefaultDisplayName="${displayName}"
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
${resourceLines}
  </Resources>

  <ExecutableList>
    <Executable Name="Minecraft.Windows.exe"
                TargetDeviceFamily="PC"
                Id="Game" />
  </ExecutableList>

  <ProtocolList>
    <Protocol Name="${protocolName}"/>
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
    console.log("[AppRegistry] Generated MicrosoftGame.Config");
}

/**
 * Installs GameInputRedist.msi if present in the version's Installers folder.
 * GameInput is required for controller/input support in GDK games.
 */
async function installGameInputRedist(versionPath: string): Promise<void> {
    const msiPath = path.join(versionPath, "Installers", "GameInputRedist.msi");
    if (!fs.existsSync(msiPath)) return;

    console.log("[AppRegistry] Installing GameInputRedist...");
    const cmd = `msiexec /i "${msiPath}" /quiet /norestart`;
    try {
        await execCommand(cmd);
        console.log("[AppRegistry] GameInputRedist installed successfully");
    } catch (e) {
        // May fail if already installed or needs elevation — not fatal
        console.warn("[AppRegistry] GameInputRedist install warning:", e);
    }
}

/**
 * Ensures all required files exist for the version (manifest patches, MicrosoftGame.Config, GameInput).
 * Safe to call repeatedly — each step is idempotent.
 */
export async function EnsureVersionFiles(version: InstalledVersionModel, onStatus?: (message: string) => void): Promise<void> {
    const status = onStatus ?? (() => {});
    const appxManifest = path.join(version.path, "appxmanifest.xml");
    const manifestXml = fs.readFileSync(appxManifest, "utf-8");

    status("Patching manifest...");
    patchManifest(appxManifest, version.path);

    status("Generating game config...");
    ensureMicrosoftGameConfig(version.path, manifestXml);

    status("Installing GameInput...");
    await installGameInputRedist(version.path);
}

function isModdedProfile(profile: Profile): boolean {
    return profile.is_modded || profile.mods.length > 0 || profile.runtime.toLowerCase() !== "vanilla";
}

function getProxyDllPath(): string {
    // Dev: predev/prestart/prebuild runs scripts/sync-proxy-dll.mjs, which
    // copies the built DLL into `<repo>/resources/proxy/dxgi.dll`.
    // Prod: electron-builder extraResources puts it at `<install>/resources/proxy/dxgi.dll`,
    // which is `process.resourcesPath`.
    const base = import.meta.env.DEV ? path.join(process.cwd(), "resources") : process.resourcesPath;
    return path.join(base, "proxy", "dxgi.dll");
}

/**
 * Ensures `dxgi.dll` is present for modded profiles and absent for vanilla profiles.
 */
export function SyncProxyDllForProfile(profile: Profile, version: InstalledVersionModel, onStatus?: (message: string) => void): void {
    const status = onStatus ?? (() => {});
    const targetPath = path.join(version.path, "dxgi.dll");
    const shouldHaveProxy = isModdedProfile(profile);

    if (!shouldHaveProxy) {
        if (fs.existsSync(targetPath)) {
            status("Removing proxy DLL for vanilla profile...");
            fs.rmSync(targetPath, { force: true });
            console.log("[AppRegistry] Removed dxgi.dll for vanilla profile");
        }
        return;
    }

    const sourcePath = getProxyDllPath();
    if (!fs.existsSync(sourcePath)) {
        throw new Error(`Failed to locate proxy dxgi.dll for modded profile launch at: ${sourcePath}`);
    }

    status("Syncing proxy DLL for modded profile...");
    fs.copyFileSync(sourcePath, targetPath);
    console.log("[AppRegistry] Synced dxgi.dll:", sourcePath, "->", targetPath);
}

export async function RegisterVersion(version: InstalledVersionModel): Promise<void> {
    // Always unregister first — the store version and loose registrations conflict
    console.log("[AppRegistry] Unregistering any existing Minecraft package...");
    try {
        await UnregisterCurrent();
    } catch (e) {
        console.warn("[AppRegistry] Unregister warning:", e);
    }

    // Ensure all required files exist before registering
    await EnsureVersionFiles(version);

    const appxManifest = path.join(version.path, "appxmanifest.xml");
    const cmd = `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path '${appxManifest}' -Register }"`;

    const stdout = await execCommand(cmd);
    if (stdout) console.log("[AppRegistry]", stdout);
    console.log("[AppRegistry] Registered", version.name);
}

export function LaunchMinecraft(version: InstalledVersionModel): void {
    const exe = path.join(version.path, "Minecraft.Windows.exe");
    const packageId = GetPackageID();
    const protocol = version.type === "preview" ? "minecraft-preview:/" : "minecraft:/";

    // Prefer protocol activation first. This matches observed behavior from the shell/UI path.
    // Using `start` avoids malformed AppsFolder shell resolution opening Documents.
    try {
        console.log("[AppRegistry] Launching via protocol:", protocol);
        child.spawn("cmd.exe", ["/c", "start", "", protocol], { detached: true, stdio: "ignore" }).unref();
        return;
    } catch (e) {
        console.warn("[AppRegistry] Protocol launch failed, falling back:", e);
    }

    // Prefer package activation so launch context matches Start menu / Windows app UI.
    // This keeps behavior consistent with modern GDK activation semantics.
    if (packageId) {
        console.log("[AppRegistry] Launching via AppsFolder activation:", packageId);
        child.spawn("explorer.exe", [`shell:AppsFolder\\${packageId}`], { detached: true, stdio: "ignore" }).unref();
        return;
    }

    // Fallback for edge cases where package metadata isn't available.
    console.log("[AppRegistry] Package ID unavailable, launching executable directly:", exe);
    child.spawn(exe, [], { detached: true, stdio: "ignore" }).unref();
}
