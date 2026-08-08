import { useAppStore } from "@renderer/states/AppStore";
import { isSideloadingBlockedByPolicy, listRegistered } from "@renderer/scripts/platform/windows/Packages";

import { LOG_IPC_ENVIRONMENT } from "@shared/diagnostics/Log";

const fs = window.require("fs") as typeof import("fs");
const os = window.require("os") as typeof import("os");
const path = window.require("path") as typeof import("path");
const { ipcRenderer } = window.require("electron") as typeof import("electron");

const APP_MODEL_UNLOCK_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";
const SHARED_FRAMEWORK = "Microsoft.NETCore.App";

/** Every probe here is optional detail. A machine that refuses one still has to produce a header. */
function probe(read: () => string): string {
    try {
        return read();
    } catch (e) {
        return `unknown (${(e as Error).message})`;
    }
}

function readDword(key: string, name: string): string {
    const regedit = window.require("regedit-rs") as typeof import("regedit-rs");
    const listed = regedit.listSync(key)[key];
    if (!listed.exists) return "unset";
    const value = listed.values[name]?.value;
    return typeof value === "number" ? String(value) : "unset";
}

function appxLine(): string {
    if (window.process.platform !== "win32") return "not applicable";
    return probe(() =>
        `DeveloperMode=${readDword(APP_MODEL_UNLOCK_KEY, "AllowDevelopmentWithoutDevLicense")} `
        + `AllowAllTrustedApps=${readDword(APP_MODEL_UNLOCK_KEY, "AllowAllTrustedApps")} `
        + `PolicyBlocked=${isSideloadingBlockedByPolicy()}`
    );
}

function registeredLines(): string[] {
    if (window.process.platform !== "win32") return [];
    try {
        return listRegistered().map(pkg => `${pkg.familyName} -> ${pkg.installPath}`);
    } catch (e) {
        return [`unknown (${(e as Error).message})`];
    }
}

/** Read-only: reports what is on disk without triggering the installer that `DotnetRuntime` owns. */
function dotnetLine(): string {
    return probe(() => {
        const toolsPath = useAppStore.getState().platform.getPaths().toolsPath;
        const candidates = [
            process.env.DOTNET_ROOT,
            window.process.platform === "win32" && process.env.ProgramFiles
                ? path.join(process.env.ProgramFiles, "dotnet")
                : null,
            process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "Microsoft", "dotnet") : null,
            path.join(toolsPath, "dotnet"),
            "/usr/share/dotnet",
            "/usr/lib/dotnet",
            path.join(os.homedir(), ".dotnet"),
        ].filter((c): c is string => typeof c === "string" && c.length > 0);

        for (const root of candidates) {
            let versions: string[];
            try {
                versions = fs.readdirSync(path.join(root, "shared", SHARED_FRAMEWORK));
            } catch {
                continue;
            }
            if (versions.length > 0) return `${versions.sort().join(", ")} at ${root}`;
        }
        return "absent";
    });
}

function countArray(filePath: string, pick: (parsed: unknown) => unknown): number | string {
    if (!fs.existsSync(filePath)) return 0;
    const value = pick(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    return Array.isArray(value) ? value.length : "malformed";
}

/** Read from disk rather than the store, so the header does not depend on startup having finished. */
function stateLine(): string {
    return probe(() => {
        const paths = useAppStore.getState().platform.getPaths();
        const profiles = probe(() => String(countArray(paths.profilesFilePath, parsed => parsed)));
        const versions = probe(() =>
            String(countArray(
                path.join(paths.versionsPath, "installed_versions.json"),
                parsed => (parsed as { versions?: unknown }).versions
            ))
        );
        const mods = probe(() =>
            String(fs.existsSync(paths.modsPath)
                ? fs.readdirSync(paths.modsPath, { withFileTypes: true }).filter(e => e.isDirectory()).length
                : 0)
        );
        return `profiles=${profiles}, installedVersions=${versions}, mods=${mods}`;
    });
}

/** Sent once per run; the writer holds the header open until it arrives or times out. */
export function reportEnvironment(): void {
    try {
        ipcRenderer.send(LOG_IPC_ENVIRONMENT, {
            appx: appxLine(),
            registered: registeredLines(),
            dotnet: dotnetLine(),
            state: stateLine(),
        });
    } catch {
        // The writer falls back to "unknown" on its own timeout.
    }
}
