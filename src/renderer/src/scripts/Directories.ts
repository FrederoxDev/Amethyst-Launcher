const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/** POSIX error code from an fs rejection, if it carries one. */
export function errnoCode(e: unknown): string | undefined {
    return typeof e === "object" && e !== null && "code" in e && typeof e.code === "string" ? e.code : undefined;
}

export function ensureParentExists(p: string) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
}

export function isDirEmpty(dir: string): boolean {
    return fs.readdirSync(dir).length === 0;
}

async function treeSizes(root: string): Promise<{ files: Map<string, number>; dirs: Set<string> }> {
    const files = new Map<string, number>();
    const dirs = new Set<string>();
    const stack: string[] = [root];

    while (stack.length > 0) {
        const current = stack.pop()!;
        const entries = await fs.promises.readdir(current, { withFileTypes: true });
        const stats: Promise<void>[] = [];
        for (const entry of entries) {
            const full = path.join(current, entry.name);
            const rel = path.relative(root, full);
            if (entry.isDirectory() && !entry.isSymbolicLink()) {
                dirs.add(rel);
                stack.push(full);
            } else if (entry.isFile()) {
                stats.push(fs.promises.stat(full).then(st => void files.set(rel, st.size)));
            }
        }
        if (stats.length > 0) await Promise.all(stats);
    }

    return { files, dirs };
}

async function assertCopyComplete(src: string, dest: string): Promise<void> {
    const [a, b] = await Promise.all([treeSizes(src), treeSizes(dest)]);

    const problems: string[] = [];
    for (const dir of a.dirs) if (!b.dirs.has(dir)) problems.push(`missing dir ${dir}`);
    for (const [file, size] of a.files) {
        const other = b.files.get(file);
        if (other === undefined) problems.push(`missing file ${file}`);
        else if (other !== size) problems.push(`size mismatch ${file} (${size} vs ${other})`);
    }

    if (problems.length > 0) {
        throw new Error(
            `Copy verification failed — ${problems.slice(0, 5).join("; ")}` +
            `${problems.length > 5 ? ` (+${problems.length - 5} more)` : ""}. Source was not deleted.`
        );
    }
}

/** Rename where possible; copy+verify+delete when Windows refuses (OneDrive, Search, shell handles). */
export async function moveDirectory(src: string, dest: string): Promise<void> {
    try {
        await fs.promises.rename(src, dest);
        return;
    } catch (e) {
        const code = errnoCode(e);
        if (!code || !["EPERM", "EBUSY", "EACCES", "ENOTEMPTY"].includes(code)) throw e;
        console.warn(`[Directories] rename failed (${code}); copying instead.`);
    }

    await fs.promises.mkdir(dest, { recursive: true });
    await fs.promises.cp(src, dest, { recursive: true, preserveTimestamps: true, errorOnExist: false });
    await assertCopyComplete(src, dest);
    await fs.promises.rm(src, { recursive: true, force: true });
}
