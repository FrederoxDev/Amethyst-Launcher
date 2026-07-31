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

/** No config yet is a real state; an unreadable or malformed one is not. */
export function readLauncherConfig(filePath: string): LauncherConfig {
    if (!fs.existsSync(filePath)) return { ...DEFAULTS };

    const raw: unknown = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    if (typeof raw !== "object" || raw === null) throw new Error(`${filePath}: expected an object`);
    const o = raw as Record<string, unknown>;

    if (typeof o.keep_open !== "boolean") throw new Error(`${filePath}: "keep_open" must be a boolean`);
    if (typeof o.ui_theme !== "string") throw new Error(`${filePath}: "ui_theme" must be a string`);
    if (typeof o.developer_mode !== "boolean") throw new Error(`${filePath}: "developer_mode" must be a boolean`);
    if (o.last_launched_profile_uuid !== null && typeof o.last_launched_profile_uuid !== "string") {
        throw new Error(`${filePath}: "last_launched_profile_uuid" must be a string or null`);
    }

    return {
        keep_open: o.keep_open,
        ui_theme: o.ui_theme,
        developer_mode: o.developer_mode,
        last_launched_profile_uuid: o.last_launched_profile_uuid,
    };
}

export function writeLauncherConfig(filePath: string, config: LauncherConfig): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(config, undefined, 4), "utf-8");
}
