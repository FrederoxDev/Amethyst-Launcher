import { log } from "./LauncherLog";
import { userMessage } from "@shared/diagnostics/Log";
import { inspectStamp, quarantineFile, stampFields, tryReadJsonFile, writeJsonAtomic } from "./Utility";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export interface LauncherConfig {
    keep_open: boolean;
    ui_theme: string;
    developer_mode: boolean;
    last_launched_profile_uuid: string | null;
    auto_check_updates: boolean;
    confirm_delete: boolean;
    trust_all_mods: boolean;
    /**
     * Inert since the move to the PE-patch preload: that DLL never allocates a console, so there
     * is nothing for this to hide. Kept so the user's saved choice survives a re-wiring.
     */
    show_console: boolean;
    /** Read by the main process before app-ready to toggle Electron HW acceleration. */
    hardware_acceleration: boolean;
    /** When true, use the OS native window frame instead of the custom titlebar. */
    native_decorations: boolean;
}

const DEFAULTS: LauncherConfig = {
    keep_open: true,
    ui_theme: "System",
    developer_mode: false,
    last_launched_profile_uuid: null,
    auto_check_updates: true,
    confirm_delete: true,
    trust_all_mods: false,
    show_console: false,
    hardware_acceleration: true,
    native_decorations: false,
};

const FORMAT = "launcher-config";
const FORMAT_VERSION = 1;

/** Plain words for the user, since a quarantine notice reaches them as well as the log. */
const WHAT = "launcher settings";

/** A key this build added: absent or the wrong type falls back rather than failing the read. */
function optionalBoolean(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

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
        // Added after the first release of this format, so a config written by an older build
        // simply lacks them. Missing means "default", never a reason to quarantine the file.
        auto_check_updates: optionalBoolean(o.auto_check_updates, DEFAULTS.auto_check_updates),
        confirm_delete: optionalBoolean(o.confirm_delete, DEFAULTS.confirm_delete),
        trust_all_mods: optionalBoolean(o.trust_all_mods, DEFAULTS.trust_all_mods),
        show_console: optionalBoolean(o.show_console, DEFAULTS.show_console),
        hardware_acceleration: optionalBoolean(o.hardware_acceleration, DEFAULTS.hardware_acceleration),
        native_decorations: optionalBoolean(o.native_decorations, DEFAULTS.native_decorations),
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
        quarantineFile("Config", filePath, WHAT, userMessage(e));
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
    writeJsonAtomic(filePath, { ...stampFields(FORMAT, FORMAT_VERSION), ...config });
}
