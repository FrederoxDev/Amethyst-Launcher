import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "preload", "build", "windows", "x64", "release", "Amethyst-Preload.dll");
const targetDir = path.join(root, "resources", "preload");
const target = path.join(targetDir, "Amethyst-Preload.dll");

if (!fs.existsSync(source)) {
    if (fs.existsSync(target)) {
        console.log("[sync-preload-dll] No xmake output; keeping the committed", target);
        process.exit(0);
    }
    console.error("[sync-preload-dll] Preload DLL not found:", source);
    console.error("[sync-preload-dll] Build it first: (cd preload && xmake f -m release -a x64 && xmake)");
    process.exit(1);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log("[sync-preload-dll] Copied", source, "->", target);
