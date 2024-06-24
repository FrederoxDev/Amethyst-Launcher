import { useEffect, useState } from "react";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import { getMinecraftUWPFolder, getModsFolder } from "../versionSwitcher/AmethystPaths";
import { ModConfig } from "../types/ModConfig";

const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path');
const child = window.require('child_process') as typeof import('child_process')

type ModErrorInfo = { modIdentifier: string, description?: string, modErrors: string[] }

function validateConfig(config: Record<any, any>, outErrors: string[]) {
    let name = "";
    let description = "";
    let version = "";
    let author = "";

    if ("meta" in config && typeof(config["meta"]) === 'object' && config["meta"] != null) {
        const meta = config["meta"];

        if (!("name" in meta && typeof(meta["name"]) === 'string')) {
            outErrors.push(`object 'meta' should have field 'name' of type 'string'`)
        }

        if (!("version" in meta && typeof(meta["version"]) === 'string')) {
            outErrors.push(`object 'meta' should have field 'version' of type 'string'`)
        }
        
        if (!("author" in meta && typeof(meta["author"]) === 'string')) {
            outErrors.push(`object 'meta' should have field 'author' of type 'string'`)
        }
        
        if ("description" in meta) {
            if (typeof(meta["description"]) !== 'string') {
                outErrors.push(`key 'description?' in 'meta' should be of type 'string'`)
            }
        }

        if ("is_runtime" in meta && typeof(meta["is_runtime"]) !== "boolean") {
            outErrors.push("key 'is_runtime?' in 'meta' should be of type 'boolean'")
        }

        name = meta["name"] ?? "";
        description = meta["description"] ?? "";
        version = meta["version"] ?? "";
        author = meta["author"] ?? "";
    }
    else {
        outErrors.push(`mod.json should have field 'meta' of type 'object'`);
    }

    return {
        meta: {
            name,
            version,
            author,
            description
        }
    }
}

function getAllMods(): ModErrorInfo[] {
    const results: ModErrorInfo[] = [];

    const modsFolder = getModsFolder();
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

        // Config data
        let modConfig: ModConfig = {
            meta: {
                author: "",
                name: "",
                version: ""
            }
        };

        // Validate that it has a config file
        const modConfigPath = path.join(modsFolder, modIdentifier, "mod.json");

        if (!fs.existsSync(modConfigPath)) {
            modErrors.push(`Missing mod.json configuration file inside mod folder.`);
        }

        else {
            try {
                const configData = fs.readFileSync(modConfigPath, "utf-8");
                const configParsed = JSON.parse(configData);
                modConfig = validateConfig(configParsed, modErrors);
                console.log(modConfig)
            }
            catch {
                modErrors.push(`Failed to parse the mod.json configuration file, invalid json?`);
            }
        }

        results.push({
            modIdentifier,
            description: modConfig.meta.description ?? "",
            modErrors
        }) 
    }

    return results;
}

const openModsFolder = () => {
    // Don't reveal in explorer unless there is an existing minecraft folder
    if (!fs.existsSync(getMinecraftUWPFolder())) {
        alert("Minecraft is not currently installed");
        return;
    }

    const folder = getModsFolder();

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
            <div className="h-full border-t-[#1E1E1F] border-y-[2px] border-solid border-b-[#1E1E1F] p-[8px] bg-[#48494A]">
                <div className="border-[2px] border-[#1E1E1F] bg-[#313233] h-full overflow-hidden">
                    { allReports.map((report) => 
                        <div onClick={() => {setSelectedReport(report)}} key={report.modIdentifier}>
                            <DividedSection className="cursor-pointer">
                                <p className="minecraft-seven text-white text-[14px] px-[4px]">{report.modIdentifier}</p>
                                <p className="minecraft-seven text-[#BCBEC0] text-[14px] px-[4px]">{report.description}</p>
                                {report.modErrors.length > 0 && (<p className="minecraft-seven text-red-400 text-[14px] px-[4px]">{report.modErrors.length} Errors!</p>)}
                            </DividedSection>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex justify-around gap-[8px] border-y-0 pb-1 border-solid border-t-[#5A5B5C] border-b-[#1E1E1F] p-[8px] bg-[#48494A]">
                {/* <div className="w-[50%]">
                    <MinecraftButton text="Import Mod" onClick={openModsFolder}/>
                </div> */}
                <div className="w-[100%]">
                    <MinecraftButton text="Open Mods Folder" onClick={openModsFolder}/>
                </div>
            </div>
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