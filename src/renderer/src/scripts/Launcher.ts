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
        ...data,
    };
}

export function SetLauncherConfig(config: LauncherConfig) {
    const paths = getPaths();
    fs.mkdirSync(path.dirname(paths.launcherConfigPath), { recursive: true });
    fs.writeFileSync(paths.launcherConfigPath, JSON.stringify(config, undefined, 4));
}
