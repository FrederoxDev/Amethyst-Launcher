import * as child from "child_process";
import * as fs from "fs";
import { useEffect, useState } from "react";

import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";

import { GetAllMods, ValidatedMod } from "@renderer/scripts/Mods";
import { MinecraftUWPFolder, ModsFolder } from "@renderer/scripts/Paths";

const openModsFolder = () => {
    // Don't reveal in explorer unless there is an existing minecraft folder
    if (!fs.existsSync(MinecraftUWPFolder)) {
        alert("Minecraft is not currently installed");
        return;
    }

    if (!fs.existsSync(ModsFolder)) fs.mkdirSync(ModsFolder, { recursive: true });

    const startGameCmd = `explorer "${ModsFolder}"`;
    child.spawn(startGameCmd, { shell: true });
};

export function ModsPage() {
    /** Page which will display information about each folder in the 'mods' directory. */
    /** Will report any errors and why they are not valid to select etc */
    /** Todo make this popup a panel after a more info button is pressed or something */

    const [allReports, setAllReports] = useState<ValidatedMod[]>([]);
    const [selectedReport, setSelectedReport] = useState<ValidatedMod | undefined>(undefined);

    useEffect(() => {
        setAllReports(GetAllMods());
    }, []);

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
                                    setSelectedReport(report);
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
                                        <p className="minecraft-seven mods-item-text">
                                            No Warnings
                                        </p>
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
                <PopupPanel onExit={() => setSelectedReport(undefined)}>
                    <div className="mods-popup">
                        <div className="mods-popup-section">
                            <div className="mods-popup-header-row">
                                <p className="minecraft-seven mods-popup-title">
                                    {selectedReport.id}
                                </p>
                                <div
                                    className="mods-popup-close"
                                    onClick={() => setSelectedReport(undefined)}
                                >
                                    <svg width="12" height="12" viewBox="0 0 12 12">
                                        <polygon
                                            className="fill-[#FFFFFF]"
                                            fillRule="evenodd"
                                            points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        {selectedReport.errors.length > 0 ? (
                            <div className="mods-popup-section">
                                <p className="minecraft-seven mods-popup-subtitle">Errors:</p>
                                <ul>
                                    {selectedReport.errors.map(err => (
                                        <li className="minecraft-seven mods-popup-error-item" key={err}>
                                            - {err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="mods-popup-section">
                                <p className="minecraft-seven mods-popup-subtitle">No errors detected!</p>
                            </div>
                        )}
                        {selectedReport.warnings.length > 0 ? (
                            <div className="mods-popup-section">
                                <p className="minecraft-seven mods-popup-subtitle">Warnings:</p>
                                <ul>
                                    {selectedReport.warnings.map(err => (
                                        <li className="minecraft-seven mods-popup-warning-item" key={err}>
                                            - {err}
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        ) : (
                            <div className="mods-popup-section">
                                <p className="minecraft-seven mods-popup-subtitle">No errors detected!</p>
                            </div>
                        )}
                    </div>
                </PopupPanel>
            )}
        </>
    );
}
