import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "proxy", "build", "windows", "x64", "release", "dxgi.dll");
const targetDir = path.join(root, "resources", "proxy");
const target = path.join(targetDir, "dxgi.dll");

if (!fs.existsSync(source)) {
    console.warn("[sync-proxy-dll] Source proxy DLL not found, skipping copy:", source);
    console.warn("[sync-proxy-dll] Build the proxy first: (cd proxy && xmake f -m release -a x64 && xmake)");
    process.exit(0);
}

fs.mkdirSync(targetDir, { recursive: true });
fs.copyFileSync(source, target);
console.log("[sync-proxy-dll] Copied", source, "->", target);
