import { UseAppState } from "@renderer/contexts/AppState";

const path = window.require("path");
const fs = window.require("fs");

function getPaths() {
    return UseAppState.getState().platform.getPaths();
}

export interface LauncherConfig {
    runtime: string;
    mods: string[];
    developer_mode: boolean;
    keep_open: boolean;
    selected_profile: number;
    ui_theme: string;
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
        developer_mode: false,
        ui_theme: "System",
        mods: [],
        runtime: "Vanilla",
        selected_profile: 0,
        ...data,
    };
}

export function SetLauncherConfig(config: LauncherConfig) {
    const paths = getPaths();
    fs.mkdirSync(path.dirname(paths.launcherConfigPath), { recursive: true });
    fs.writeFileSync(paths.launcherConfigPath, JSON.stringify(config, undefined, 4));
}
