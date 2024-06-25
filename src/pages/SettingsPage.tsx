import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import ToggleSection from "../components/ToggleSection";
import {useAppState} from "../contexts/AppState";
import {SemVersion} from "../types/SemVersion";
import { isRegisteredVersionOurs, isVersionDownloaded } from "../versionSwitcher/VersionManager";
import { getInstalledMinecraftPackagePath } from "../versionSwitcher/AppRegistry";
import { getAmethystFolder, getLauncherConfig, getMinecraftUWPFolder } from "../versionSwitcher/AmethystPaths";
import { isDeveloperModeEnabled } from "../versionSwitcher/DeveloperMode";
import ReadOnlyTextBox from "../components/ReadOnlyTextBox";
import { useEffect, useState } from "react";
import MinecraftToggle from "../components/MinecraftToggle"

const fs = window.require('fs') as typeof import('fs');


export default function SettingsPage() {
    const {
        keepLauncherOpen,
        setKeepLauncherOpen,
        developerMode,
        setDeveloperMode,
    } = useAppState()

    const {allProfiles, selectedProfile, allMinecraftVersions} = useAppState();
    const [launcherCfg, setLauncherCfg] = useState<string>(""); 

    const profile = allProfiles[selectedProfile];
    let minecraftVersion = undefined;
    let isVerDownloaded = false;
    let isRegisteredVerOurs = false;
    let installDir = "";

    const amethystFolder = getAmethystFolder()
    const minecraftFolder = getMinecraftUWPFolder()
    let isWindowsDevModeOn = isDeveloperModeEnabled();

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
        const configFile = getLauncherConfig();

        if (!fs.existsSync(configFile)) {
            setLauncherCfg("Launcher config does not exist...");
            return;
        }

        const data = fs.readFileSync(configFile, 'utf-8');
        setLauncherCfg(data)
    }

    useEffect(() => {
        const timer = setTimeout(updateCfgText, 0);
        return () => clearTimeout(timer);
    }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode])

    return (
        <MainPanel>
            <div className="border-b-[2px] border-solid border-b-[#1E1E1F] p-[8px] bg-[#48494A]">
                <div className="flex items-center justify-center">
                    <div>
                        <p className="minecraft-seven text-white text-[14px]">{"Keep launcher open"}</p>
                        <p className="minecraft-seven text-[#BCBEC0] text-[12px]">{"Prevents the launcher from closing after launching the game."}</p>
                    </div>
                    <div className="ml-auto">
                        <MinecraftToggle id={"Keep launcher open"} isChecked={keepLauncherOpen} setIsChecked={setKeepLauncherOpen}/>
                    </div>
                </div>
            </div>

            <ToggleSection
                text="Developer mode"
                subtext="Enables hot-reloading and prompting to attach a debugger."
                isChecked={developerMode}
                setIsChecked={setDeveloperMode}
            />
            <DividedSection className="minecraft-seven text-[#BCBEC0] text-[14px]">
                <p className="text-white">Debug Info</p>
                <p>Minecraft Version: {minecraftVersion ? minecraftVersion.toString() : "No version found."}</p>
                <p>Is version downloaded: {isVerDownloaded ? "true" : "false"}</p>
                <p>Is Registered Version Ours: {isRegisteredVerOurs ? "true" : "false"}</p>
                <p>Is windows developer mode: {isWindowsDevModeOn ? "enabled" : "disabled"}</p>
                <p>Install path: {installDir}</p>
                <p>Amethyst Folder: {amethystFolder}</p>
                <p>Minecraft Folder: {minecraftFolder}</p>
            </DividedSection>

            <DividedSection>
                <ReadOnlyTextBox text={launcherCfg ?? " "} label="Launcher Config"/>
            </DividedSection>

            <DividedSection className="flex-grow flex justify-around gap-[8px]">
                <div className="h-full flex flex-col"></div>
            </DividedSection>
        </MainPanel>
    )
}