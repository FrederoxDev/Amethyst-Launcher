import {useAppState} from "../contexts/AppState";
import {SemVersion} from "../scripts/classes/SemVersion";
import { isRegisteredVersionOurs, isVersionDownloaded } from "../scripts/VersionManager";
import { getInstalledMinecraftPackagePath } from "../scripts/AppRegistry";
import { AmethystFolder, LauncherConfigPath, MinecraftUWPFolder } from "../scripts/Paths";
import { isDeveloperModeEnabled } from "../scripts/DeveloperMode";
import ReadOnlyTextBox from "../components/ReadOnlyTextBox";
import { useEffect, useState } from "react";
import MinecraftToggle from "../components/MinecraftToggle"
import MinecraftRadialButtonPanel from "../components/MinecraftRadialButtonPanel";

const fs = window.require('fs') as typeof import('fs');


export default function SettingsPage() {
    const {
        keepLauncherOpen, setKeepLauncherOpen,
        developerMode, setDeveloperMode,
        UITheme, setUITheme
    } = useAppState()

    const {allProfiles, selectedProfile, allMinecraftVersions} = useAppState();
    const [launcherCfg, setLauncherCfg] = useState<string>(""); 

    const profile = allProfiles[selectedProfile];
    let minecraftVersion = undefined;
    let isVerDownloaded = false;
    let isRegisteredVerOurs = false;
    let installDir = "";

    const isWindowsDevModeOn = isDeveloperModeEnabled();

    if (profile) {
        const semVersion = SemVersion.fromString(profile.minecraft_version);
        minecraftVersion = allMinecraftVersions.find(version => version.version.toString() === semVersion.toString());

        if (minecraftVersion) {
            isVerDownloaded = isVersionDownloaded(minecraftVersion.version)
            isRegisteredVerOurs = isRegisteredVersionOurs(minecraftVersion)
            installDir = getInstalledMinecraftPackagePath(minecraftVersion) ?? "Could not find installed."
        }
    }

    const updateCfgText = () => {
        if (!fs.existsSync(LauncherConfigPath)) {
            setLauncherCfg("Launcher config does not exist...");
            return;
        }

        const data = fs.readFileSync(LauncherConfigPath, 'utf-8');
        setLauncherCfg(data)
    }

    useEffect(() => {
        const timer = setTimeout(updateCfgText, 0);
        return () => clearTimeout(timer);
    }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode, UITheme])

    return (
        <div className="flex flex-col h-fit max-h-full border-[3px] border-[#1E1E1F] bg-[#48494a] overflow-y-auto" style={{scrollbarWidth:"none"}}>
            <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <div className="flex items-center justify-center">
                    <div>
                        <p className="minecraft-seven text-white text-[14px]">{"Keep launcher open"}</p>
                        <p className="minecraft-seven text-[#BCBEC0] text-[12px]">{"Prevents the launcher from closing after launching the game."}</p>
                    </div>
                    <div className="ml-auto">
                        <MinecraftToggle isChecked={keepLauncherOpen} setIsChecked={setKeepLauncherOpen}/>
                    </div>
                </div>
            </div>

            <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <div className="flex items-center justify-center">
                    <div>
                        <p className="minecraft-seven text-white text-[14px]">{"Developer mode"}</p>
                        <p className="minecraft-seven text-[#BCBEC0] text-[12px]">{"Enables hot-reloading and prompting to attach a debugger."}</p>
                    </div>
                    <div className="ml-auto">
                        <MinecraftToggle isChecked={developerMode} setIsChecked={setDeveloperMode}/>
                    </div>
                </div>
            </div>

            <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <p className="minecraft-seven text-white text-[14px]">UI Theme</p>
                <MinecraftRadialButtonPanel elements={[{text: "Light", value: "Light"}, {text: "Dark", value: "Dark"}, {text:"System", value:"System"}]} default_selected_value={UITheme} onChange={(value => { setUITheme(value) })}/>
            </div>

            <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px] minecraft-seven text-[#BCBEC0] text-[14px] shrink-0 overflow-x-hidden">
                <p className="text-white">Debug Info</p>
                <p>Minecraft Version: {minecraftVersion ? minecraftVersion.toString() : "No version found."}</p>
                <p>Is version downloaded: {isVerDownloaded ? "true" : "false"}</p>
                <p>Is Registered Version Ours: {isRegisteredVerOurs ? "true" : "false"}</p>
                <p>Is windows developer mode: {isWindowsDevModeOn ? "enabled" : "disabled"}</p>
                <p>Install path: {installDir}</p>
                <p>Amethyst Folder: {AmethystFolder}</p>
                <p>Minecraft Folder: {MinecraftUWPFolder}</p>
            </div>

            <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <ReadOnlyTextBox text={launcherCfg ?? " "} label="Launcher Config"/>
            </div>
        </div>
    )
}