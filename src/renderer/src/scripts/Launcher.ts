import { log } from "./LauncherLog";
import { inspectStamp, quarantineFile, stampFields, tryReadJsonFile } from "./Utility";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export interface LauncherConfig {
    keep_open: boolean;
    ui_theme: string;
    developer_mode: boolean;
    last_launched_profile_uuid: string | null;
}

const DEFAULTS: LauncherConfig = {
    keep_open: true,
    ui_theme: "System",
    developer_mode: false,
    last_launched_profile_uuid: null,
};

const FORMAT = "launcher-config";
const FORMAT_VERSION = 1;

/** Plain words for the user, since a quarantine notice reaches them as well as the log. */
const WHAT = "launcher settings";

function parseConfig(o: Record<string, unknown>): LauncherConfig {
    if (typeof o.keep_open !== "boolean") throw new Error(`"keep_open" must be a boolean, not ${typeof o.keep_open}`);
    if (typeof o.ui_theme !== "string") throw new Error(`"ui_theme" must be a string, not ${typeof o.ui_theme}`);
    if (typeof o.developer_mode !== "boolean") throw new Error(`"developer_mode" must be a boolean, not ${typeof o.developer_mode}`);
    if (o.last_launched_profile_uuid !== null && typeof o.last_launched_profile_uuid !== "string") {
        throw new Error(`"last_launched_profile_uuid" must be a string or null, not ${typeof o.last_launched_profile_uuid}`);
    }

    return {
        keep_open: o.keep_open,
        ui_theme: o.ui_theme,
        developer_mode: o.developer_mode,
        last_launched_profile_uuid: o.last_launched_profile_uuid,
    };
}

/**
 * Settings the user chose, so nothing here is ever deleted: a file this build cannot read is
 * moved aside and the launcher carries on with defaults.
 */
export function readLauncherConfig(filePath: string): LauncherConfig {
    if (!fs.existsSync(filePath)) {
        log("Config", `No config at ${filePath}, using defaults: ${JSON.stringify(DEFAULTS)}`);
        return { ...DEFAULTS };
    }

    const read = tryReadJsonFile<unknown>("Config", filePath);
    if (!read.ok) {
        quarantineFile("Config", filePath, WHAT, read.reason);
        return { ...DEFAULTS };
    }

    const stamp = inspectStamp("Config", filePath, read.value, FORMAT, FORMAT_VERSION);
    if (stamp.state === "mismatch") {
        quarantineFile("Config", filePath, WHAT, stamp.reason);
        return { ...DEFAULTS };
    }

    if (typeof read.value !== "object" || read.value === null || Array.isArray(read.value)) {
        quarantineFile("Config", filePath, WHAT, "it does not hold a JSON object");
        return { ...DEFAULTS };
    }

    let config: LauncherConfig;
    try {
        config = parseConfig(read.value as Record<string, unknown>);
    } catch (e) {
        quarantineFile("Config", filePath, WHAT, (e as Error).message);
        return { ...DEFAULTS };
    }

    log(
        "Config",
        `Read ${filePath}${stamp.state === "legacy" ? " as an unstamped file, it gets a stamp on the next save" : ""}: `
        + `keep_open=${config.keep_open}, ui_theme=${config.ui_theme}, developer_mode=${config.developer_mode}, `
        + `last_launched_profile_uuid=${config.last_launched_profile_uuid}`
    );
    return config;
}

export function writeLauncherConfig(filePath: string, config: LauncherConfig): void {
    // Not logged: every profile-editor keystroke saves, and the settings writes that matter
    // are already logged as old -> new by the store that made them.
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const body = { ...stampFields(FORMAT, FORMAT_VERSION), ...config };
    fs.writeFileSync(filePath, JSON.stringify(body, undefined, 4), "utf-8");
}
