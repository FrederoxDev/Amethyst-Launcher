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
}
