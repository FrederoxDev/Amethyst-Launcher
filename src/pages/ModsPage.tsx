import { useEffect, useState } from "react";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import { useAppState } from "../contexts/AppState";
import { getAmethystFolder, getMinecraftFolder } from "../versionSwitcher/VersionManager";
import MinecraftButton from "../components/MinecraftButton";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');
const child = window.require('child_process') as typeof import('child_process')

type ModErrorInfo = { modIdentifier: string, description?: string, modErrors: string[] }

function getAllMods(): ModErrorInfo[] {
    const results: ModErrorInfo[] = [];

    const modsFolder = path.join(getAmethystFolder(), 'mods');
    if (!fs.existsSync(modsFolder)) return results;

    const allModNames = fs.readdirSync(modsFolder, {withFileTypes: true})
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

    for (const modIdentifier of allModNames) {
        const modErrors: string[] = []

        // Validate that the mod is in the naming scheme
        if (!modIdentifier.includes("@")) {
            modErrors.push(`Folder named '${modIdentifier}' must include a version number`);
        }

        // Validate that it has a config file
        const modConfigPath = path.join(modsFolder, modIdentifier, "mod.json");
        if (!fs.existsSync(modConfigPath)) {
            modErrors.push(`Missing mod.json configuration file inside mod folder.`);
        }

        else {
            try {
                const configData = fs.readFileSync(modConfigPath, "utf-8");
                const configParsed = JSON.parse(configData);
                // validateConfig(configParsed, modErrors)
            }
            catch {
                modErrors.push(`Failed to parse the mod.json configuration file, invalid json?`);
            }
        }

        results.push({
            modIdentifier,
            description: "wow this is a description yap yap yap yap yap. bla bla bla wow this is a description yap yap yap",
            modErrors
        }) 
    }

    return results;
}

const openModsFolder = () => {
    // Don't reveal in explorer unless there is an existing minecraft folder
    if (!fs.existsSync(getMinecraftFolder())) {
        alert("Minecraft is not currently installed");
        return;
    }

    const folder = path.join(getAmethystFolder(), 'mods');

    if (!fs.existsSync(folder)) fs.mkdirSync(folder, {recursive: true});

    const startGameCmd = `explorer "${folder}"`;
    child.spawn(startGameCmd, {shell: true})
}
 
export default function ModsPage() {
    /** Page which will display information about each folder in the mods directory. */
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
            <DividedSection className="h-full">
                <div className="border-[2px] border-[#1E1E1F] bg-[#313233] h-full overflow-hidden">
                    { allReports.map((report) => 
                        <div onClick={() => {setSelectedReport(report)}} key={report.modIdentifier}>
                            <DividedSection className="cursor-pointer">
                                <p className="minecraft-seven text-white text-[14px] px-[4px]">{report.modIdentifier}</p>
                                {report.modErrors.length > 0 && (<p className="minecraft-seven text-red-400 text-[14px] px-[4px]">{report.modErrors.length} Errors!</p>)}
                            </DividedSection>
                        </div>
                    )}
                </div>
            </DividedSection>
            <DividedSection className="flex justify-around gap-[8px]">
                <div className="w-[50%]">
                    <MinecraftButton text="Import Mod" onClick={openModsFolder}/>
                </div>
                <div className="w-[50%]">
                    <MinecraftButton text="Open Mods Folder" onClick={openModsFolder}/>
                </div>
            </DividedSection>
        </MainPanel>

        {selectedReport && (<>
            <div className="fixed top-0 left-0 w-full h-full bg-[#000000BB]" onClick={() => setSelectedReport(undefined)}></div>

            <div className="fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center justify-center">
                <DividedSection className="w-[500px]">
                    <div className="flex">
                        <p className="minecraft-seven text-white text-[12px] max-w-[400px]">{selectedReport.modIdentifier}</p>
                        <p className="minecraft-seven text-[#BCBEC0] text-[12px] text-right ml-auto cursor-pointer" onClick={() => setSelectedReport(undefined)}>X</p>
                    </div>

                    <p className="minecraft-seven text-[#BCBEC0] text-[12px] max-w-[400px]">{selectedReport.description ?? ""}</p>
                </DividedSection>
                {selectedReport.modErrors.length > 0 && (
                    <DividedSection className="w-[500px]">    
                        <p className="minecraft-seven text-white text-[12px] pt-[6px]">Errors:</p>
                        <ul>
                            {selectedReport.modErrors.map(err => (
                                <li className="minecraft-seven text-red-400 text-[12px]" key={err}>- {err}</li>
                            ))}
                        </ul>
                    </DividedSection>
                )}
            </div>
        </>)}
        </>
    )
}