import { LauncherConfigPath } from "./Paths";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');

export interface LauncherConfig {
    runtime: string,
    mods: string[],
    developer_mode: boolean,
    keep_open: boolean,
    selected_profile: number,
    ui_theme: string
}

export function saveLauncherConfig(config: LauncherConfig) {
    fs.mkdirSync(path.dirname(LauncherConfigPath), {recursive: true});
    fs.writeFileSync(LauncherConfigPath, JSON.stringify(config, undefined, 4));
}

export function readLauncherConfig(): LauncherConfig {
    let data: Partial<LauncherConfig> = {};

    try {
        const jsonData = fs.readFileSync(LauncherConfigPath, "utf-8");
        data = JSON.parse(jsonData);
    } catch {
        console.error(`Failed to read/parse the launcherConfig file`);
    }

    return {
        developer_mode: false,
        keep_open: true,
        mods: [],
        runtime: "Vanilla",
        selected_profile: 0,
        ui_theme: "System",
        ...data,
    }
}