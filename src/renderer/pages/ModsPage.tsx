import { useEffect, useState } from "react";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import { MinecraftUWPFolder, ModsFolder } from "../scripts/Paths";

import { ValidateMod, ModConfig } from "../scripts/Mods";
import PopupPanel from "../components/PopupPanel";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');
const child = window.require('child_process') as typeof import('child_process')

type ModErrorInfo = { modIdentifier: string, description?: string, modErrors: string[] }



function getAllMods(): ModErrorInfo[] {
    const results: ModErrorInfo[] = [];

    if (!fs.existsSync(ModsFolder)) return results;

    const allModNames = fs.readdirSync(ModsFolder, {withFileTypes: true})
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

    for (const modIdentifier of allModNames) {
        const modErrors: string[] = []


        // Config data
        let modConfig: ModConfig = {
            meta: {
                author: "",
                name: "",
                version: ""
            }
        };

        // Validate that it has a config file
        const modConfigPath = path.join(ModsFolder, modIdentifier, "mod.json");

        if (!fs.existsSync(modConfigPath)) {
            modErrors.push(`Missing mod.json configuration file inside mod folder.`);
        }

        else {
            try {
                const configData = fs.readFileSync(modConfigPath, "utf-8");
                const configParsed = JSON.parse(configData);
                modConfig = ValidateMod(configParsed, modErrors);
            }
            catch {
                modErrors.push(`Failed to parse the mod.json configuration file, invalid json?`);
            }
        }

        results.push({
            modIdentifier: modConfig.meta.name,
            description: modConfig.meta.description ?? "",
            modErrors
        }) 
    }

    return results;
}

const openModsFolder = () => {
    // Don't reveal in explorer unless there is an existing minecraft folder
    if (!fs.existsSync(MinecraftUWPFolder)) {
        alert("Minecraft is not currently installed");
        return;
    }

    if (!fs.existsSync(ModsFolder)) fs.mkdirSync(ModsFolder, {recursive: true});

    const startGameCmd = `explorer "${ModsFolder}"`;
    child.spawn(startGameCmd, {shell: true})
}
 
export default function ModsPage() {
    /** Page which will display information about each folder in the 'mods' directory. */
    /** Will report any errors and why they are not valid to select etc */
    /** Todo make this popup a panel after a more info button is pressed or something */
    
    const [allReports, setAllReports] = useState<ModErrorInfo[]>([]);
    const [selectedReport, setSelectedReport] = useState<ModErrorInfo | undefined>(undefined);

    useEffect(() => {
        setAllReports(getAllMods());
    }, [])

    return (
        <>
            <MainPanel>
                <div className="flex flex-col gap-[8px] h-full p-[8px] bg-[#48494A] border-[3px] border-[#1E1E1F]">
                    <p className="minecraft-seven text-white text-[14px]">Mod Manager</p>
                    <div className="h-full border-[3px] border-[#1E1E1F] bg-[#313233] overflow-y-auto scrollbar">
                        { allReports.map((report) =>
                            <div onClick={() => {setSelectedReport(report)}} key={report.modIdentifier}>
                                <div className="cursor-pointer border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                                    <p className="minecraft-seven text-white text-[14px] px-[4px]">{report.modIdentifier}</p>
                                    <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{report.description}</p>
                                    {report.modErrors.length > 0 && (<p className="minecraft-seven text-red-400 text-[14px] px-[4px]">{report.modErrors.length} Errors!</p>)}
                                    {report.modErrors.length === 0 && <p className="minecraft-seven text-[#BCBEC0] text-[14px] px-[4px]">No Errors</p>}
                                </div>
                            </div>
                        )}
                    </div>
                    <div className= "w-full h-fit">
                        <MinecraftButton text="Open Mods Folder" onClick={openModsFolder}/>
                    </div>
                </div>
            </MainPanel>

            {
                selectedReport &&
                    <PopupPanel onExit={() => setSelectedReport(undefined)}>
                        <div className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                            <div className="flex">
                                <p className="minecraft-seven text-white text-[14px] max-w-[400px]">{selectedReport.modIdentifier}</p>
                                <div className="p-[4px] justify-center items-center ml-auto cursor-pointer"
                                     onClick={() => setSelectedReport(undefined)}>
                                    <svg width="12" height="12" viewBox="0 0 12 12">
                                        <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                                 points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"/>
                                    </svg>
                                </div>
                            </div>

                            <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">{selectedReport.description ?? ""}</p>
                        </div>
                        {
                            selectedReport.modErrors.length > 0

                                ?

                                (
                                    <div
                                        className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                                        <p className="minecraft-seven text-white text-[12px]">Errors:</p>
                                        <ul>
                                            {selectedReport.modErrors.map(err => (
                                                <li className="minecraft-seven text-red-400 text-[12px]"
                                                    key={err}>- {err}</li>
                                            ))}
                                        </ul>
                                    </div>
                                )

                                :

                                (
                                    <div
                                        className="w-[500px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                                        <p className="minecraft-seven text-white text-[12px]">No issues detected!</p>
                                    </div>
                                )
                        }
                    </PopupPanel>
            }
    </>
    )
}