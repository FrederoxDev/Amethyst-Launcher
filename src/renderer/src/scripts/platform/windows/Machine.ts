import { Channel } from "@renderer/scripts/domain/Channel";
import { ForeignGameDataError } from "../LauncherPlatform";
import * as DataLink from "./DataLink";
import * as Packages from "./Packages";
import * as VersionFiles from "./VersionFiles";

const child = window.require("child_process") as typeof import("child_process");
const path = window.require("path") as typeof import("path");

const GAME_EXECUTABLE = "Minecraft.Windows.exe";

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

    if (VersionFiles.isProxyPresent(desired.versionPath) !== desired.proxy) {
        status(desired.proxy ? "Installing runtime proxy..." : "Removing runtime proxy...");
        VersionFiles.setProxyPresent(desired.versionPath, desired.proxy);
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
 * Starts the game by running its executable.
 *
 * Not via appx activation, and not via protocol. A GDK title takes its identity from
 * the MicrosoftGame.Config beside the exe, so it does not need to be activated as a
 * package — and it must not be: appx activation additionally enforces a Store licence
 * that a loose dev-mode registration cannot satisfy, so the process exits immediately
 * without writing so much as a log. Protocol activation is worse still: registration
 * leaves `HKCU\Software\Classes\<proto>` a stub with no `shell\open\command`, so it
 * resolves to nothing at all.
 */
export function activate(versionPath: string): void {
    const exe = path.join(versionPath, GAME_EXECUTABLE);
    console.log("[Machine] Launching:", exe);
    child.spawn(exe, [], { cwd: versionPath, detached: true, stdio: "ignore" }).unref();
}
