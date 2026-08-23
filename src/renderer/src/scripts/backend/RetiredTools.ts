import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";
import { useAppStore } from "@renderer/states/AppStore";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/** What a .NET root holds, so a folder that merely shares the name is left alone. */
function looksLikeDotnetRoot(root: string): boolean {
    return (
        fs.existsSync(path.join(root, "shared", "Microsoft.NETCore.App")) ||
        fs.existsSync(path.join(root, "dotnet.exe")) ||
        fs.existsSync(path.join(root, "dotnet"))
    );
}

/**
 * Deletes the private .NET runtime earlier launcher versions installed for XVDTool. Nothing
 * reads it now that XVDTool carries its own runtime, and it is hundreds of megabytes.
 */
export async function removeRetiredDotnet(): Promise<void> {
    const root = path.join(useAppStore.getState().platform.getPaths().toolsPath, "dotnet");
    if (!fs.existsSync(root)) return;

    if (!looksLikeDotnetRoot(root)) {
        log("Cleanup", `Leaving ${root} alone: it does not look like a .NET runtime the launcher installed`);
        return;
    }

    try {
        await fs.promises.rm(root, { recursive: true, force: true });
    } catch (e) {
        log("Cleanup", `Could not delete the retired .NET runtime at ${root}: ${describeError(e)}`);
        return;
    }
    log("Cleanup", `Deleted the retired .NET runtime at ${root}`);
}
