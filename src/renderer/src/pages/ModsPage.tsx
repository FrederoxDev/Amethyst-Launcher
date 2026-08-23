import * as child from "child_process";
import * as fs from "fs";
import { useState } from "react";

import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";

import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { ValidatedMod } from "@renderer/scripts/Mods";
import { useAppStore } from "@renderer/states/AppStore";

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

const openModsFolder = () => {
    const paths = getPaths();
    if (!fs.existsSync(paths.modsPath)) {
        log("ModsPage", `Creating the mods folder ${paths.modsPath} before opening it`);
        fs.mkdirSync(paths.modsPath, { recursive: true });
    }

    const opener = window.process.platform === "win32" ? "explorer.exe" : "xdg-open";
    log("ModsPage", `Opening ${paths.modsPath} with ${opener}`);
    // Not run through the process runner: explorer reports a non-zero code even when it opened
    // the folder, so its exit says nothing. Only a failure to start is worth reporting.
    const proc = child.spawn(opener, [paths.modsPath], {
        detached: true,
        stdio: "ignore",
    });
    proc.on("error", error =>
        log("ModsPage", `Could not start ${opener} for ${paths.modsPath}: ${describeError(error)}`)
    );
    proc.unref();
};

export function ModsPage() {
    /** Page which will display information about each folder in the 'mods' directory. */
    /** Will report any errors and why they are not valid to select etc */
    /** Todo make this popup a panel after a more info button is pressed or something */

    // The store's copy, kept current by the app's watcher on the mods folder: a page reporting mod
    // state cannot be showing the scan it took when it opened.
    const allReports: readonly ValidatedMod[] = useAppStore(state => state.allMods);
    const [selectedId, setSelectedId] = useState<string | undefined>(undefined);
    const selectedReport = allReports.find(report => report.id === selectedId);

    return (
        <>
            <MainPanel>
                <div className="mods-page">
                    <p className="minecraft-seven mods-title">Mod Manager</p>
                    <div className="mods-list scrollbar">
                        {allReports.map(report => (
                            <div
                                className="mods-item"
                                onClick={() => {
                                    setSelectedId(report.id);
                                }}
                                key={report.id}
                            >
                                <div className="mods-item-inner">
                                    <p className="minecraft-seven mods-item-name">{report.id}</p>
                                    {report.errors.length > 0 && (
                                        <p className="minecraft-seven mods-item-error">
                                            {report.errors.length} Errors!
                                        </p>
                                    )}
                                    {report.errors.length === 0 && (
                                        <p className="minecraft-seven mods-item-text">No Errors</p>
                                    )}
                                    {report.warnings.length > 0 && (
                                        <p className="minecraft-seven mods-item-warning">
                                            {report.warnings.length} Warnings!
                                        </p>
                                    )}
                                    {report.warnings.length === 0 && (
                                        <p className="minecraft-seven mods-item-text">No Warnings</p>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mods-footer">
                        <MinecraftButton text="Open Mods Folder" onClick={openModsFolder} />
                    </div>
                </div>
            </MainPanel>
            {selectedReport && (
                <PopupPanel title={selectedReport.id} onClose={() => setSelectedId(undefined)} size="lg">
                    <p className="minecraft-seven mods-popup-subtitle">
                        {selectedReport.errors.length > 0 ? "Errors:" : "No errors detected!"}
                    </p>
                    {selectedReport.errors.length > 0 && (
                        <ul>
                            {selectedReport.errors.map(err => (
                                <li className="minecraft-seven mods-popup-error-item" key={err}>
                                    - {err}
                                </li>
                            ))}
                        </ul>
                    )}
                    <p className="minecraft-seven mods-popup-subtitle">
                        {selectedReport.warnings.length > 0 ? "Warnings:" : "No warnings detected!"}
                    </p>
                    {selectedReport.warnings.length > 0 && (
                        <ul>
                            {selectedReport.warnings.map(err => (
                                <li className="minecraft-seven mods-popup-warning-item" key={err}>
                                    - {err}
                                </li>
                            ))}
                        </ul>
                    )}
                </PopupPanel>
            )}
        </>
    );
}
