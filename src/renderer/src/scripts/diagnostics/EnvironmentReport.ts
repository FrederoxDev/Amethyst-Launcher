import { useAppStore } from "@renderer/states/AppStore";

import { LOG_IPC_ENVIRONMENT } from "@shared/diagnostics/Log";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { ipcRenderer } = window.require("electron") as typeof import("electron");

const APP_MODEL_UNLOCK_KEY = "HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\AppModelUnlock";

/** Enough that a user toggling Developer Mode is picked up, not so little that alt-tabbing probes. */
const REPEAT_INTERVAL_MS = 30_000;

type Packages = typeof import("@renderer/scripts/platform/windows/Packages");

/** Every probe here is optional detail. A machine that refuses one still has to produce a header. */
function probe(read: () => string): string {
    try {
        return read();
    } catch (e) {
        return `unknown (${(e as Error).message})`;
    }
}

function probeValue<T>(read: () => T, fallback: T): T {
    try {
        return read();
    } catch {
        return fallback;
    }
}

/** Loaded only on the platform that has a registry, so the Linux bundle carries none of it. */
async function windowsPackages(): Promise<Packages | null> {
    if (window.process.platform !== "win32") return null;
    try {
        return await import("@renderer/scripts/platform/windows/Packages");
    } catch {
        return null;
    }
}

/** Hands the frame back between probes, so a slow registry read is not a frozen window. */
function yieldToUi(): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, 0));
}

function readDword(key: string, name: string): string {
    const regedit = window.require("regedit-rs") as typeof import("regedit-rs");
    const listed = regedit.listSync(key)[key];
    if (!listed.exists) return "unset";
    const value = listed.values[name]?.value;
    return typeof value === "number" ? String(value) : "unset";
}

/** One failed probe costs its own field and nothing else; each of these is a separate cause. */
function appxLine(packages: Packages | null): string {
    if (packages === null) return "not applicable";
    const developerMode = probe(() => readDword(APP_MODEL_UNLOCK_KEY, "AllowDevelopmentWithoutDevLicense"));
    const trustedApps = probe(() => readDword(APP_MODEL_UNLOCK_KEY, "AllowAllTrustedApps"));
    const policy = probe(() => String(packages.readSideloadingPolicyBlock() ?? "unknown"));
    return `DeveloperMode=${developerMode} AllowAllTrustedApps=${trustedApps} PolicyBlocked=${policy}`;
}

function registeredLines(packages: Packages | null): string[] {
    if (packages === null) return [];
    try {
        return packages.listRegistered().map(pkg => `${pkg.familyName} -> ${pkg.installPath}`);
    } catch (e) {
        return [`unknown (${(e as Error).message})`];
    }
}

function countArray(filePath: string, pick: (parsed: unknown) => unknown): number | string {
    if (!fs.existsSync(filePath)) return 0;
    const value = pick(JSON.parse(fs.readFileSync(filePath, "utf-8")));
    return Array.isArray(value) ? value.length : "malformed";
}

/** Read from disk rather than the store, so the header does not depend on startup having finished. */
function stateLine(): string {
    const paths = probeValue(() => useAppStore.getState().platform.getPaths(), null);

    // Mirrors ProfileStore.load: stamped files nest the array under `profiles`, and only files
    // written before stamping existed are a bare array.
    const profiles = paths === null ? "unknown" : probe(() => String(countArray(
        paths.profilesFilePath,
        parsed => (Array.isArray(parsed) ? parsed : (parsed as { profiles?: unknown })?.profiles)
    )));

    const versions = paths === null ? "unknown" : probe(() => String(countArray(
        path.join(paths.versionsPath, "installed_versions.json"),
        parsed => (parsed as { versions?: unknown }).versions
    )));

    const mods = paths === null ? "unknown" : probe(() =>
        String(fs.existsSync(paths.modsPath)
            ? fs.readdirSync(paths.modsPath, { withFileTypes: true }).filter(e => e.isDirectory()).length
            : 0)
    );

    return `profiles=${profiles}, installedVersions=${versions}, mods=${mods}`;
}

let lastSentAt = 0;
let collecting = false;

async function collect(): Promise<void> {
    if (collecting || Date.now() - lastSentAt < REPEAT_INTERVAL_MS) return;
    collecting = true;
    lastSentAt = Date.now();

    try {
        const packages = await windowsPackages();
        const appx = appxLine(packages);
        await yieldToUi();
        const registered = registeredLines(packages);
        await yieldToUi();
        const state = stateLine();

        ipcRenderer.send(LOG_IPC_ENVIRONMENT, { appx, registered, state });
    } catch {
        // The writer falls back to "unknown" on its own timeout.
    } finally {
        collecting = false;
    }
}

/**
 * The writer holds the header open until this arrives, and takes a later report over the one it
 * settled for — so a machine that took minutes to get here still gets its real environment in.
 */
export function reportEnvironment(): void {
    void collect();
}

// Developer Mode and package registrations are changed outside the launcher, and the trip out to
// change them ends with the window being focused again.
window.addEventListener("focus", () => void collect());
