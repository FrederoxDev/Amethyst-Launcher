import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import ToggleSection from "../components/ToggleSection";
import {useAppState} from "../contexts/AppState";
import {SemVersion} from "../types/SemVersion";
import {
    getAmethystFolder,
    getInstalledMinecraftPackagePath,
    getMinecraftFolder,
    isDeveloperModeEnabled,
    isRegisteredVersionOurs,
    isVersionDownloaded
} from "../versionSwitcher/VersionManager";
import path from "node:path";

const fs = window.require('fs') as typeof import('fs');
const child = window.require('child_process') as typeof import('child_process')

export default function SettingsPage() {
    const {
        keepLauncherOpen,
        setKeepLauncherOpen,
        developerMode,
        setDeveloperMode,
        autoUpdate,
        setAutoUpdate,
        notifyOnUpdate,
        setNotifyOnUpdate
    } = useAppState()

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

    const {allProfiles, selectedProfile, allMinecraftVersions} = useAppState();

    const profile = allProfiles[selectedProfile];
    let minecraftVersion = undefined;
    let isVerDownloaded = false;
    let isRegisteredVerOurs = false;
    let installDir = "";

    const amethystFolder = getAmethystFolder()
    const minecraftFolder = getMinecraftFolder()
    let isWindowsDevModeOn = isDeveloperModeEnabled();

    if (profile) {
        const semVersion = SemVersion.fromString(profile.minecraft_version);
        minecraftVersion = allMinecraftVersions.find(version => version.version.toString() == semVersion.toString());

        if (minecraftVersion) {
            isVerDownloaded = isVersionDownloaded(minecraftVersion.version)
            isRegisteredVerOurs = isRegisteredVersionOurs(minecraftVersion)
            installDir = getInstalledMinecraftPackagePath(minecraftVersion) ?? "Could not find installed."
        }
    }

    return (
        <MainPanel>
            <ToggleSection
                text="Keep launcher open"
                subtext="Prevents the launcher from closing after launching the game."
                isChecked={keepLauncherOpen}
                setIsChecked={setKeepLauncherOpen}
            />
            <ToggleSection
                text="Notify Update"
                subtext="Notifies the user when a new update is found."
                isChecked={notifyOnUpdate}
                setIsChecked={setNotifyOnUpdate}
            />
            <ToggleSection
                text="Auto Update"
                subtext="Allows the launcher to update automatically when a new update is found."
                isChecked={autoUpdate}
                setIsChecked={setAutoUpdate}
            />
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
            <DividedSection className="flex-grow flex justify-around gap-[8px]">
                <div className="h-full flex flex-col"></div>
            </DividedSection>
            <DividedSection>
                <MinecraftButton text="Open Mods Folder" onClick={openModsFolder}/>
            </DividedSection>
        </MainPanel>
    )
}