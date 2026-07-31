const child = window.require("child_process") as typeof import("child_process");
const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

type RegeditModule = typeof import("regedit-rs");

const PACKAGES_KEY =
    "HKCU\\SOFTWARE\\Classes\\Local Settings\\Software\\Microsoft\\Windows\\CurrentVersion\\AppModel\\Repository\\Packages";

/** Any Minecraft Bedrock package family, not a fixed list — release, preview, and whatever ships next. */
const MINECRAFT_FAMILY_PREFIX = "microsoft.minecraft";

export interface RegisteredPackage {
    /** Identity name, e.g. `Microsoft.MinecraftWindowsBeta`. */
    family: string;
    installPath: string;
}

function regedit(): RegeditModule {
    return window.require("regedit-rs") as RegeditModule;
}

function exec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
        child.exec(command, (error, stdout, stderr) => {
            if (error) reject(new Error(stderr || error.message));
            else resolve(stdout);
        });
    });
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

        out.push({ family: key.split("_")[0], installPath });
    }
    return out;
}

export async function unregister(family: string): Promise<void> {
    await exec(
        `powershell -ExecutionPolicy Bypass -Command "& { Get-AppxPackage ${family} | ` +
        `Remove-AppxPackage -PreserveRoamableApplicationData }"`
    );
    console.log(`[Packages] Unregistered ${family}`);
}

export async function register(versionPath: string): Promise<void> {
    const manifest = path.join(versionPath, "appxmanifest.xml");
    const stdout = await exec(
        `powershell -ExecutionPolicy Bypass -Command "& { Add-AppxPackage -Path '${manifest}' -Register }"`
    );
    if (stdout) console.log("[Packages]", stdout);
    console.log(`[Packages] Registered ${versionPath}`);
}
