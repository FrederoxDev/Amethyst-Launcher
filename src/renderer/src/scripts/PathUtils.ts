const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");

/** Windows keeps these for devices, with or without an extension, and in either case. */
const RESERVED_NAMES = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(\.|$)/i;

export class PathUtils {
    /** The directory itself, for a path that names a directory. */
    static ensureDirectory(dirPath: string): string {
        fs.mkdirSync(dirPath, { recursive: true });
        return dirPath;
    }

    /** The parent, for a path that names a file that is about to be written. */
    static ensureParentDirectory(filePath: string): string {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        return filePath;
    }

    static async chmodRecursive(dirPath: string, mode: number): Promise<void> {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });

        await Promise.all(entries.map(async entry => {
            const fullPath = path.join(dirPath, entry.name);
            await fs.promises.chmod(fullPath, mode);

            if (entry.isDirectory()) {
                await PathUtils.chmodRecursive(fullPath, mode);
            }
        }));
    }

    /**
     * Names that survive this become real directories. Windows accepts several through the API
     * that Explorer then cannot open or delete, so they are rejected here rather than created.
     */
    static isValidFileName(name: string): boolean {
        if (name.trim().length === 0) return false;
        if (name === "." || name === "..") return false;
        if (name !== name.trimEnd() || name.endsWith(".")) return false;

        if ([...name].some(c => c.codePointAt(0)! < 0x20)) return false;

        if (window.process.platform === "win32") {
            if (RESERVED_NAMES.test(name)) return false;
            return !/[\\/:*?"<>|]/.test(name);
        }

        return !name.includes("/");
    }
}
