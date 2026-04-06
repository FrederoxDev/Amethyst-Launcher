import { useAppStore } from "@renderer/states/AppStore";

const path = window.require("path");
const fs = window.require("fs");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface LauncherConfig {
    keep_open: boolean;
    selected_profile: number;
    ui_theme: string;
    developer_mode: boolean;
    trust_all_mods: boolean;
    auto_check_updates: boolean;
    show_console: boolean;
    confirm_delete: boolean;
    profiles: string[];
    active_profile: string | null;
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
        selected_profile: 0,
        developer_mode: false,
        trust_all_mods: false,
        auto_check_updates: true,
        show_console: false,
        confirm_delete: true,
        profiles: [],
        active_profile: null,
        ...data,
    };
}

export function SetLauncherConfig(config: LauncherConfig) {
    const paths = getPaths();
    fs.mkdirSync(path.dirname(paths.launcherConfigPath), { recursive: true });
    fs.writeFileSync(paths.launcherConfigPath, JSON.stringify(config, undefined, 4));
}

export function SetActiveProfile(uuid: string | null): void {
    const current = GetLauncherConfig();
    current.active_profile = uuid;
    SetLauncherConfig(current);
}
