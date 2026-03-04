const path = window.require("path");

export class PathUtils {
    static Join(...paths: string[]): string {
        return path.join(...paths);
    }
}
