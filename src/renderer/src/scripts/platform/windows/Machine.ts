import { Channel } from "@renderer/scripts/domain/Channel";
import { ForeignGameDataError } from "../LauncherPlatform";
import * as DataLink from "./DataLink";
import * as Packages from "./Packages";
import * as VersionFiles from "./VersionFiles";

const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");


/**
 * The slots one launch owns. Every one is scoped to a single channel or a single build:
 * release and preview are separate games with separate package families and separate
 * data folders, and a launch of one must never touch the other.
 */
export interface DesiredState {
    channel: Channel;
    versionPath: string;
    dataDir: string;
    proxy: boolean;
}

function samePath(a: string, b: string): boolean {
    return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
}

function reconcileDataLink(desired: DesiredState, status: (m: string) => void): void {
    const state = DataLink.readLink(desired.channel);

    switch (state.kind) {
        case "blocked-by-file":
            throw new Error(
                `"${DataLink.roamingPath(desired.channel)}" is a file, not a folder. Remove or rename it.`
            );

        case "foreign-data":
            throw new ForeignGameDataError(desired.channel, DataLink.roamingPath(desired.channel));

        case "linked":
            if (samePath(state.target, desired.dataDir)) return;
            status("Switching game data to this profile...");
            DataLink.unlink(desired.channel);
            break;

        case "empty-dir":
            status("Linking game data to this profile...");
            DataLink.removeEmptyDir(desired.channel);
            break;

        case "absent":
            status("Creating game data folder...");
            break;
    }

    DataLink.link(desired.channel, desired.dataDir);
}

/** Touches only this build's own family; another channel's registration is never disturbed. */
async function reconcilePackage(desired: DesiredState, status: (m: string) => void): Promise<void> {
    const wantFamily = packageFamilyFor(desired.versionPath).toLowerCase();
    const sameFamily = Packages.listRegistered().filter(pkg => pkg.family.toLowerCase() === wantFamily);

    if (sameFamily.some(pkg => samePath(pkg.installPath, desired.versionPath))) return;

    for (const pkg of sameFamily) {
        status(`Unregistering ${pkg.family}...`);
        await Packages.unregister(pkg.family);
    }

    status("Registering Minecraft...");
    await Packages.register(desired.versionPath);
}

/** The appx family a build belongs to, i.e. which of the two games it is. */
export function packageFamilyFor(versionPath: string): string {
    return Packages.readIdentityName(versionPath);
}

/**
 * Brings the machine's global slots in line with `desired`, applying only what
 * differs. Idempotent, so a run interrupted halfway is just a smaller diff next time.
 */
export async function reconcile(desired: DesiredState, onStatus?: (m: string) => void): Promise<void> {
    const status = onStatus ?? (() => {});

    // Cheap and reversible first, invasive last.
    reconcileDataLink(desired, status);
    await VersionFiles.ensureVersionFiles(desired.versionPath, desired.channel, status);

    if (desired.proxy) {
        if (!VersionFiles.isProxyCurrent(desired.versionPath)) {
            status("Installing runtime proxy...");
            VersionFiles.installProxy(desired.versionPath);
        }
    } else if (VersionFiles.isProxyPresent(desired.versionPath)) {
        status("Removing runtime proxy...");
        VersionFiles.removeProxy(desired.versionPath);
    }

    await reconcilePackage(desired, status);
}

/** Where the channel's data folder currently points, or null if it isn't linked. */
export function currentDataTarget(channel: Channel): string | null {
    const state = DataLink.readLink(channel);
    return state.kind === "linked" ? state.target : null;
}

export function unlinkChannel(channel: Channel): void {
    if (DataLink.readLink(channel).kind === "linked") DataLink.unlink(channel);
}

export function foreignDataPath(channel: Channel): string | null {
    return DataLink.readLink(channel).kind === "foreign-data" ? DataLink.roamingPath(channel) : null;
}

/**
 * Activates the registered package, which is what gives the process package identity.
 * That identity is load-bearing: the loader then resolves imports through the package
 * graph, so the dxgi.dll proxy sitting in the build folder wins over System32's. A plain
 * CreateProcess on the exe starts the game but has no package identity, so System32 wins
 * and mods silently never load.
 *
 * By AUMID rather than protocol — `Add-AppxPackage -Register` leaves
 * `HKCU\Software\Classes\<proto>` a stub with no `shell\open\command`.
 */
export function activate(versionPath: string): void {
    const wantFamily = packageFamilyFor(versionPath).toLowerCase();
    const pkg = Packages.listRegistered().find(p => p.family.toLowerCase() === wantFamily);
    if (!pkg) throw new Error(`${versionPath} is not registered, so it cannot be activated.`);

    const aumid = `${pkg.familyName}!${Packages.readApplicationId(versionPath)}`;
    console.log("[Machine] Activating:", aumid);
    child.spawn("explorer.exe", [`shell:AppsFolder\\${aumid}`], { detached: true, stdio: "ignore" }).unref();
}
