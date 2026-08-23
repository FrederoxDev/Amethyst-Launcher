import { useAppStore } from "@renderer/states/AppStore";
import { Profile } from "./Profiles";
import { MinecraftVersionType } from "./VersionDatabase";

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

export function ensureParentExists(p: string) {
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

async function summarizeTree(root: string): Promise<DirSummary> {
    const files = new Map<string, number>();
    const dirs = new Set<string>();
    const stack: string[] = [root];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = await fs.promises.readdir(current, { withFileTypes: true });
        const fileStats: Promise<void>[] = [];
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            const rel = path.relative(root, full);
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                dirs.add(rel);
                stack.push(full);
            } else if (entry.isFile()) {
                fileStats.push(
                    fs.promises.stat(full).then(st => {
                        files.set(rel, st.size);
                    })
                );
            }
        }
        if (fileStats.length > 0) await Promise.all(fileStats);
    }

    return { files, dirs };
}

async function verifyCopy(src: string, dest: string): Promise<void> {
    const [srcSummary, destSummary] = await Promise.all([summarizeTree(src), summarizeTree(dest)]);

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
            missingDirs.length > 0
                ? `missing dirs: ${missingDirs.slice(0, 5).join(", ")}${missingDirs.length > 5 ? "..." : ""}`
                : null,
            missingFiles.length > 0
                ? `missing files: ${missingFiles.slice(0, 5).join(", ")}${missingFiles.length > 5 ? "..." : ""}`
                : null,
            sizeMismatches.length > 0
                ? `size mismatches: ${sizeMismatches.slice(0, 5).join(", ")}${sizeMismatches.length > 5 ? "..." : ""}`
                : null,
        ]
            .filter(Boolean)
            .join("; ");
        throw new Error(`Migration copy verification failed — ${details}. Source has not been deleted.`);
    }
}

/**
 * Moves a directory to a new location. Prefers rename (atomic, instant on
 * same volume) but falls back to recursive copy+verify+delete if Windows
 * refuses — typically because OneDrive, Windows Search, or a shell window
 * holds a transient handle on the source.
 */
export async function moveDirectory(src: string, dest: string): Promise<void> {
    try {
        await fs.promises.rename(src, dest);
        return;
    } catch (e: any) {
        const code = e?.code;
        if (code !== "EPERM" && code !== "EBUSY" && code !== "EACCES" && code !== "ENOTEMPTY") {
            throw e;
        }
        console.warn(`[ProfileDataLinker] rename failed with ${code}, falling back to copy+verify+delete.`);
    }

    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.cp(src, dest, { recursive: true, preserveTimestamps: true, errorOnExist: false });
    await verifyCopy(src, dest);
    await fs.promises.rm(src, { recursive: true, force: true });
}

const INIT_MARKER = ".initialized";

/** True if any profile junction has ever been successfully set up. */
export function isProfileDataInitialized(profileDataRoot: string): boolean {
    return fs.existsSync(path.join(profileDataRoot, INIT_MARKER));
}

export function markProfileDataInitialized(profileDataRoot: string) {
    fs.mkdirSync(profileDataRoot, { recursive: true });
    // Write atomically: write to .tmp, then rename. A mid-write crash would
    // otherwise leave a truncated marker that fools `isProfileDataInitialized`
    // (which only checks existence) and permanently skip onboarding.
    const finalPath = path.join(profileDataRoot, INIT_MARKER);
    const tmpPath = `${finalPath}.tmp`;
    fs.writeFileSync(tmpPath, new Date().toISOString(), "utf-8");
    fs.renameSync(tmpPath, finalPath);
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
            throw new Error(`"${roamingPath}" exists as a file, not a folder. Remove or rename it before launching.`);

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
                try {
                    fs.symlinkSync(state.target, roamingPath, "junction");
                } catch {
                    /* best-effort */
                }
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
                try {
                    fs.rmdirSync(roamingPath);
                } catch {
                    /* ignore */
                }
                try {
                    createJunction(roamingPath, targetPath);
                } catch (e) {
                    // Recreate the empty roaming folder so the system is back where it was.
                    try {
                        fs.mkdirSync(roamingPath, { recursive: true });
                    } catch {
                        /* best-effort */
                    }
                    removeEmptyDirsUpTo(targetPath, profileDataRoot);
                    throw e;
                }
                markProfileDataInitialized(profileDataRoot);
                return;
            }

            // Non-empty real directory. Onboarding runs on first launcher open and
            // converts any pre-existing data into a profile (or deletes it), so by
            // the time we get to launch we should never see this. If we do, it's
            // either a corrupted setup or the user manually placed data here —
            // either way, refuse to touch it.
            throw new Error(
                `"${roamingPath}" contains data that isn't associated with any profile. ` +
                    `Move or remove the folder manually, then restart the launcher.`
            );
        }
    }
}
