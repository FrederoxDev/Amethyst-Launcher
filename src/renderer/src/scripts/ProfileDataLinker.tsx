import { useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";
import { Profile } from "./Profiles";
import { MinecraftVersionType } from "./VersionDatabase";
import ProfileDataMigratePopup, { MigrateChoice } from "@renderer/popups/ProfileDataMigratePopup";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const os = window.require("os") as typeof import("os");

export type RoamingState =
    | { kind: "missing" }
    | { kind: "junction"; target: string }
    | { kind: "real-dir"; empty: boolean }
    | { kind: "file" };

function getAppDataRoot(): string {
    return process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
}

/** The roaming folder Minecraft reads from, based on the build's version type. */
export function resolveRoamingPath(type: MinecraftVersionType): string {
    const appData = getAppDataRoot();
    // Dev builds also use the "release" roaming folder.
    return type === "preview"
        ? path.join(appData, "Minecraft Bedrock Preview")
        : path.join(appData, "Minecraft Bedrock");
}

/** Our per-profile data folder that the roaming path will be junctioned to. */
export function resolveProfileDataPath(profile: Profile): string {
    const paths = useAppStore.getState().platform.getPaths();
    return path.join(paths.profileDataPath, profile.uuid);
}

function normalizeLink(target: string): string {
    // fs.readlink may return paths like \\?\C:\... — strip the NT prefix.
    let t = target;
    if (t.startsWith("\\\\?\\")) t = t.slice(4);
    return path.resolve(t);
}

export function inspectRoamingState(roamingPath: string): RoamingState {
    let st: ReturnType<typeof fs.lstatSync>;
    try {
        st = fs.lstatSync(roamingPath);
    } catch {
        return { kind: "missing" };
    }

    if (st.isSymbolicLink()) {
        try {
            const target = normalizeLink(fs.readlinkSync(roamingPath));
            return { kind: "junction", target };
        } catch {
            return { kind: "junction", target: "" };
        }
    }

    if (st.isDirectory()) {
        let empty = true;
        try {
            empty = fs.readdirSync(roamingPath).length === 0;
        } catch {
            empty = true;
        }
        return { kind: "real-dir", empty };
    }

    return { kind: "file" };
}

function ensureParentExists(p: string) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
}

function createJunction(junctionPath: string, targetPath: string) {
    fs.mkdirSync(targetPath, { recursive: true });
    ensureParentExists(junctionPath);
    fs.symlinkSync(path.resolve(targetPath), junctionPath, "junction");
}

function removeJunction(junctionPath: string) {
    // unlinkSync on a junction removes only the link, not the target contents.
    fs.unlinkSync(junctionPath);
}

interface DirSummary {
    files: Map<string, number>;
    dirs: Set<string>;
}

function summarizeTree(root: string): DirSummary {
    const files = new Map<string, number>();
    const dirs = new Set<string>();
    const stack: string[] = [root];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            const rel = path.relative(root, full);
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                dirs.add(rel);
                stack.push(full);
            } else if (entry.isFile()) {
                const st = fs.statSync(full);
                files.set(rel, st.size);
            }
        }
    }

    return { files, dirs };
}

function verifyCopy(src: string, dest: string): void {
    const srcSummary = summarizeTree(src);
    const destSummary = summarizeTree(dest);

    const missingDirs: string[] = [];
    for (const dir of srcSummary.dirs) {
        if (!destSummary.dirs.has(dir)) missingDirs.push(dir);
    }

    const missingFiles: string[] = [];
    const sizeMismatches: string[] = [];
    for (const [file, size] of srcSummary.files) {
        const destSize = destSummary.files.get(file);
        if (destSize === undefined) {
            missingFiles.push(file);
        } else if (destSize !== size) {
            sizeMismatches.push(`${file} (src=${size}, dest=${destSize})`);
        }
    }

    if (missingDirs.length > 0 || missingFiles.length > 0 || sizeMismatches.length > 0) {
        const details = [
            missingDirs.length > 0 ? `missing dirs: ${missingDirs.slice(0, 5).join(", ")}${missingDirs.length > 5 ? "..." : ""}` : null,
            missingFiles.length > 0 ? `missing files: ${missingFiles.slice(0, 5).join(", ")}${missingFiles.length > 5 ? "..." : ""}` : null,
            sizeMismatches.length > 0 ? `size mismatches: ${sizeMismatches.slice(0, 5).join(", ")}${sizeMismatches.length > 5 ? "..." : ""}` : null
        ].filter(Boolean).join("; ");
        throw new Error(`Migration copy verification failed — ${details}. Source has not been deleted.`);
    }
}

/**
 * Moves a directory to a new location. Prefers rename (atomic, instant on
 * same volume) but falls back to recursive copy+verify+delete if Windows
 * refuses — typically because OneDrive, Windows Search, or a shell window
 * holds a transient handle on the source.
 */
function moveDirectory(src: string, dest: string) {
    try {
        fs.renameSync(src, dest);
        return;
    } catch (e: any) {
        const code = e?.code;
        if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES" && code !== "ENOTEMPTY") {
            throw e;
        }
        console.warn(`[ProfileDataLinker] rename failed with ${code}, falling back to copy+verify+delete.`);
    }

    fs.mkdirSync(dest, { recursive: true });
    fs.cpSync(src, dest, { recursive: true, preserveTimestamps: true, errorOnExist: false });
    verifyCopy(src, dest);
    fs.rmSync(src, { recursive: true, force: true });
}

const INIT_MARKER = ".initialized";

/** True if any profile junction has ever been successfully set up. */
function isProfileDataInitialized(profileDataRoot: string): boolean {
    return fs.existsSync(path.join(profileDataRoot, INIT_MARKER));
}

function markProfileDataInitialized(profileDataRoot: string) {
    fs.mkdirSync(profileDataRoot, { recursive: true });
    fs.writeFileSync(path.join(profileDataRoot, INIT_MARKER), new Date().toISOString(), "utf-8");
}

/** Recursively try to remove empty directories up to (but not including) `stopAt`. */
function removeEmptyDirsUpTo(leaf: string, stopAt: string) {
    let current = leaf;
    const stop = path.resolve(stopAt);
    while (path.resolve(current) !== stop) {
        try {
            fs.rmdirSync(current);
        } catch {
            return;
        }
        const parent = path.dirname(current);
        if (parent === current) return;
        current = parent;
    }
}

export async function ensureProfileJunction(
    profile: Profile,
    type: MinecraftVersionType,
    onStatus?: (msg: string) => void
): Promise<void> {
    const status = onStatus ?? (() => {});
    const roamingPath = resolveRoamingPath(type);
    const targetPath = resolveProfileDataPath(profile);
    const profileDataRoot = useAppStore.getState().platform.getPaths().profileDataPath;

    status("Checking Minecraft data folder...");
    const state = inspectRoamingState(roamingPath);

    switch (state.kind) {
        case "file":
            throw new Error(
                `"${roamingPath}" exists as a file, not a folder. Remove or rename it before launching.`
            );

        case "missing": {
            status("Creating profile data folder...");
            try {
                createJunction(roamingPath, targetPath);
            } catch (e) {
                removeEmptyDirsUpTo(targetPath, profileDataRoot);
                throw e;
            }
            markProfileDataInitialized(profileDataRoot);
            return;
        }

        case "junction": {
            const wanted = path.resolve(targetPath);
            if (state.target.toLowerCase() === wanted.toLowerCase()) {
                markProfileDataInitialized(profileDataRoot);
                return;
            }
            status("Repointing data folder to this profile...");
            removeJunction(roamingPath);
            try {
                createJunction(roamingPath, targetPath);
            } catch (e) {
                // Try to restore the previous junction so we don't lose the link.
                try { fs.symlinkSync(state.target, roamingPath, "junction"); } catch { /* best-effort */ }
                removeEmptyDirsUpTo(targetPath, profileDataRoot);
                throw e;
            }
            markProfileDataInitialized(profileDataRoot);
            return;
        }

        case "real-dir": {
            if (state.empty) {
                // No user data to lose — just replace with a junction.
                status("Linking data folder to this profile...");
                try { fs.rmdirSync(roamingPath); } catch { /* ignore */ }
                try {
                    createJunction(roamingPath, targetPath);
                } catch (e) {
                    // Recreate the empty roaming folder so the system is back where it was.
                    try { fs.mkdirSync(roamingPath, { recursive: true }); } catch { /* best-effort */ }
                    removeEmptyDirsUpTo(targetPath, profileDataRoot);
                    throw e;
                }
                markProfileDataInitialized(profileDataRoot);
                return;
            }

            // Non-empty real directory. Only valid on the very first setup.
            if (isProfileDataInitialized(profileDataRoot)) {
                throw new Error(
                    `"${roamingPath}" contains data but per-profile storage is already set up. ` +
                    `This is unexpected — refusing to touch it. Move or remove the folder manually to continue.`
                );
            }

            // First-time migration — must confirm with the user.
            status("Waiting for migration confirmation...");
            const choice = await Popup.useAsync<MigrateChoice>(({ submit }) => (
                <ProfileDataMigratePopup
                    profileName={profile.name}
                    roamingPath={roamingPath}
                    onChoose={submit}
                />
            ));

            if (choice === "cancel") {
                throw new Error("Launch cancelled — existing Minecraft data was not migrated.");
            }

            if (choice === "migrate") {
                status("Migrating existing data into profile...");
                ensureParentExists(targetPath);
                // targetPath must not exist before move; isProfileDataInitialized was false so this is clean state.
                let moved = false;
                try {
                    moveDirectory(roamingPath, targetPath);
                    moved = true;
                    createJunction(roamingPath, targetPath);
                } catch (e) {
                    if (moved) {
                        // Data is at targetPath but junction failed. Try to restore.
                        try {
                            moveDirectory(targetPath, roamingPath);
                        } catch (restoreErr) {
                            throw new Error(
                                `Your Minecraft data was moved to "${targetPath}" but creating the junction at "${roamingPath}" failed, and restoring the original location also failed. ` +
                                `Your data is safe — to recover, move "${targetPath}" back to "${roamingPath}" manually. Original error: ${e}. Restore error: ${restoreErr}`
                            );
                        }
                    }
                    removeEmptyDirsUpTo(targetPath, profileDataRoot);
                    throw e;
                }
                markProfileDataInitialized(profileDataRoot);
                return;
            }

            // "fresh": back up the existing folder, start empty.
            const stamp = new Date().toISOString().replace(/[:.]/g, "-");
            const backupPath = `${roamingPath}.backup-${stamp}`;
            status("Backing up existing data...");
            let backedUp = false;
            try {
                moveDirectory(roamingPath, backupPath);
                backedUp = true;
                createJunction(roamingPath, targetPath);
            } catch (e) {
                if (backedUp) {
                    try {
                        moveDirectory(backupPath, roamingPath);
                    } catch (restoreErr) {
                        throw new Error(
                            `Your Minecraft data was moved to "${backupPath}" but creating the junction at "${roamingPath}" failed, and restoring the original location also failed. ` +
                            `Your data is safe — to recover, move "${backupPath}" back to "${roamingPath}" manually. Original error: ${e}. Restore error: ${restoreErr}`
                        );
                    }
                }
                removeEmptyDirsUpTo(targetPath, profileDataRoot);
                throw e;
            }
            markProfileDataInitialized(profileDataRoot);
            return;
        }
    }
}
