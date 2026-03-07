import { useAppStore } from "@renderer/states/AppStore";

const path = window.require("path");
const fs = window.require("fs");

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

export interface LauncherConfig {
    runtime: string;
    mods: string[];
    keep_open: boolean;
    selected_profile: number;
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
        mods: [],
        runtime: "Vanilla",
        selected_profile: 0,
        developer_mode: false,
        ...data,
    };
}

export function SetLauncherConfig(config: LauncherConfig) {
    const paths = getPaths();
    fs.mkdirSync(path.dirname(paths.launcherConfigPath), { recursive: true });
    fs.writeFileSync(paths.launcherConfigPath, JSON.stringify(config, undefined, 4));
}
