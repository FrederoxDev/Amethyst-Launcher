import { useAppStore } from "@renderer/states/AppStore";

const path = window.require("path");
const fs = window.require("fs");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface LauncherConfig {
    keep_open: boolean;
    selected_release_profile_uuid?: string | null;
    selected_preview_profile_uuid?: string | null;
    /**
     * UUID of the most recently launched profile. Written right before launch so
     * the proxy DLL can pick the correct runtime. Not the source of UI selection
     * highlighting — that's selected_release/preview_profile_uuid.
     */
    selected_profile_uuid?: string | null;
    ui_theme: string;
    developer_mode: boolean;
    auto_check_updates: boolean;
    confirm_delete: boolean;
    trust_all_mods: boolean;
    /** Read by the proxy DLL to decide whether to keep the Amethyst console window. */
    show_console: boolean;
    /** Read by the main process before app-ready to toggle Electron HW acceleration. */
    hardware_acceleration: boolean;
    /** When true, use the OS native window frame instead of the custom titlebar. */
    native_decorations: boolean;
}

export function GetLauncherConfig(): LauncherConfig {
    const paths = getPaths();
    let data: Partial<LauncherConfig> = {};

    try {
        const jsonData = fs.readFileSync(paths.launcherConfigPath, "utf-8");
        data = JSON.parse(jsonData);
    } catch {
        console.error(`Failed to read/parse the launcherConfig file`);
    }

    return {
        keep_open: true,
        ui_theme: "System",
        selected_release_profile_uuid: null,
        selected_preview_profile_uuid: null,
        selected_profile_uuid: null,
        developer_mode: false,
        auto_check_updates: true,
        confirm_delete: true,
        trust_all_mods: false,
        show_console: false,
        hardware_acceleration: true,
        native_decorations: false,
        ...data,
    };
}

export function SetLauncherConfig(config: LauncherConfig) {
    const paths = getPaths();
    fs.mkdirSync(path.dirname(paths.launcherConfigPath), { recursive: true });
    fs.writeFileSync(paths.launcherConfigPath, JSON.stringify(config, undefined, 4));
}
