const path = window.require("path");
const fs = window.require("fs");

export class PathUtils {
    static ValidatePath(in_path: string): string {
        if (!fs.existsSync(in_path)) {
            const in_path_dir: string = path.dirname(in_path);
            fs.mkdirSync(in_path_dir, { recursive: true });
        }
        return in_path;
    }

    static DeletePath(in_path: string): void {
        if (fs.existsSync(in_path)) {
            fs.rmSync(in_path, { recursive: true });
        }
    }

    static async chmodRecursive(dirPath: string, mode: number) {
        const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
        
        await Promise.all(entries.map(async (entry) => {
            const fullPath = path.join(dirPath, entry.name);
            await fs.promises.chmod(fullPath, mode);
            
            if (entry.isDirectory()) {
                await PathUtils.chmodRecursive(fullPath, mode);
            }
        }));
    }
}
