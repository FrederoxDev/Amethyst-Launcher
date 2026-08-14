import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/ProcessRunner";
import { addImport, importsDll, PeFormatError } from "./PeImports";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/**
 * The DLL the game is made to import, and the symbol that forces the loader to resolve it.
 *
 * The name is part of the on-disk contract: it is written into the game's import table once,
 * at install time, and every later launch depends on a file of exactly this name sitting next
 * to the executable. It must never change without a matching re-patch of every installed build.
 */
export const PRELOAD_DLL = "Amethyst-Preload.dll";
const PRELOAD_IMPORT_SYMBOL = "AmethystPreloadEntry";

/** Distinctive enough to identify the launcher's own build of the old proxy, and stable across its versions. */
const LEGACY_PROXY_MARKER = "AmethystProxy";
const LEGACY_PROXY_MAX_BYTES = 8 * 1024 * 1024;

function describeFile(target: string): string {
    try {
        const stat = fs.statSync(target);
        return `${stat.size} bytes, written ${stat.mtime.toISOString()}`;
    } catch (e) {
        return `unreadable: ${describeError(e)}`;
    }
}

export function preloadDllPath(versionPath: string): string {
    return path.join(versionPath, PRELOAD_DLL);
}

export function sourcePreloadDllPath(): string {
    const base = import.meta.env.DEV ? path.join(process.cwd(), "resources") : process.resourcesPath;
    return path.join(base, "preload", PRELOAD_DLL);
}

export function gameExecutablePath(versionPath: string, executableName: string): string {
    return path.join(versionPath, executableName);
}

/**
 * Whether the build's import table already names the preload DLL.
 *
 * Read from the image itself rather than trusted to a marker file beside it: a marker cannot
 * notice that the build was re-extracted or repaired underneath it, and a build that is believed
 * to be patched but is not starts vanilla with no mods and no explanation.
 */
export function isBuildPatched(exePath: string): boolean {
    try {
        return importsDll(exePath, PRELOAD_DLL);
    } catch (e) {
        log("Preload", `Could not read the import table of ${exePath}, treating it as unpatched: ${describeError(e)}`);
        return false;
    }
}

function installPreloadDll(versionPath: string): void {
    const source = sourcePreloadDllPath();
    if (!fs.existsSync(source)) {
        log("Preload", `The launcher's own preload DLL is missing from ${source}`);
        throw new Error(
            `${PRELOAD_DLL} was not found at ${source}. Build the preload DLL before launching a modded profile.`
        );
    }

    const target = preloadDllPath(versionPath);
    try {
        fs.copyFileSync(source, target);
    } catch (e) {
        log("Preload", `Could not copy ${source} to ${target}: ${describeError(e)}`);
        throw new Error(
            "The mod loader could not be put in place, so this profile cannot start with mods.\n\n" +
                `${target} (${describeError(e)})`,
            { cause: e }
        );
    }
    log("Preload", `Installed ${PRELOAD_DLL}: ${source} to ${target} (${describeFile(target)})`);
}

/**
 * Puts the preload DLL next to the game and, once, writes an import of it into the executable.
 *
 * A build is patched the first time a modded profile uses it and stays patched: builds are
 * shared between profiles, so unpatching for an unmodded one would thrash the executable, and
 * there is nothing to unpatch for - the preload reads the session manifest and does nothing at
 * all when the profile it describes carries no runtime.
 *
 * The import is mandatory to the loader, so the DLL goes in before the patch is applied and has
 * to stay there for every later launch. An executable importing a file that is not there does
 * not start at all, and fails inside Windows rather than anywhere the launcher can explain it.
 */
export function ensurePreload(
    versionPath: string,
    executableName: string,
    modded: boolean,
    status: (message: string) => void
): void {
    removeLauncherProxy(versionPath);

    const exePath = gameExecutablePath(versionPath, executableName);
    const patched = isBuildPatched(exePath);

    if (!modded && !patched) {
        log("Preload", `${versionPath} is unpatched and this profile is unmodded, leaving the build alone`);
        return;
    }

    installPreloadDll(versionPath);

    if (patched) {
        log("Preload", `${exePath} already imports ${PRELOAD_DLL}, leaving it as is`);
        return;
    }

    status("Preparing the mod loader...");
    log("Preload", `${exePath} does not import ${PRELOAD_DLL} yet, adding it`);

    try {
        const result = addImport(exePath, PRELOAD_DLL, PRELOAD_IMPORT_SYMBOL);
        log(
            "Preload",
            `Added an import of ${result.dllName}!${result.functionName} to ${exePath}: ` +
                `${result.bytesAppended} bytes appended at RVA 0x${result.sectionRva.toString(16)}`
        );
    } catch (e) {
        log("Preload", `Could not add the import to ${exePath}: ${describeError(e)}`);
        throw new Error(
            e instanceof PeFormatError
                ? "This Minecraft version could not be prepared for mods, because its program file is not in the " +
                      "form the launcher expects.\n\nDelete this version in the launcher and download it again.\n\n" +
                      `${exePath} (${describeError(e)})`
                : "This Minecraft version could not be prepared for mods.\n\nCheck that the drive is not full and " +
                      `that antivirus software is not blocking the launcher, then press Play again.\n\n${exePath}`,
            { cause: e }
        );
    }

    if (!isBuildPatched(exePath)) {
        log("Preload", `${exePath} still does not import ${PRELOAD_DLL} after patching it`);
        throw new Error(
            "This Minecraft version could not be prepared for mods, and the change did not take.\n\n" +
                "Delete this version in the launcher and download it again."
        );
    }
}

/**
 * Whether a `dxgi.dll` is the launcher's own retired proxy rather than something the user put
 * there. ReShade and friends install under exactly this name, and deleting one of those would
 * take a working setup away from someone who never asked the launcher to touch it.
 */
export function isLauncherProxy(dllPath: string): boolean {
    try {
        const stat = fs.statSync(dllPath);
        if (!stat.isFile() || stat.size > LEGACY_PROXY_MAX_BYTES) return false;
        return fs.readFileSync(dllPath).includes(LEGACY_PROXY_MARKER, 0, "ascii");
    } catch (e) {
        log("Preload", `Could not read ${dllPath} to tell whether it is the launcher's own proxy: ${describeError(e)}`);
        return false;
    }
}

/**
 * Removes the dxgi proxy left behind by earlier launcher versions.
 *
 * It is inert once the build is patched - nothing imports it any more - but it stays on disk
 * forever otherwise, and while it is there it is still what a package-activated launch loads,
 * which would run two mod loaders at once.
 */
export function removeLauncherProxy(versionPath: string): void {
    const target = path.join(versionPath, "dxgi.dll");
    if (!fs.existsSync(target)) return;

    if (!isLauncherProxy(target)) {
        log("Preload", `Leaving ${target} alone: it is not the launcher's own proxy (${describeFile(target)})`);
        return;
    }

    try {
        fs.rmSync(target, { force: true });
    } catch (e) {
        // Not fatal: a patched build does not load it, so a proxy that cannot be deleted today
        // is clutter rather than a reason to refuse the launch.
        log("Preload", `Could not delete the retired proxy at ${target}: ${describeError(e)}`);
        return;
    }
    log("Preload", `Deleted the retired proxy at ${target}`);
}
