import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import MinecraftButton from "../components/MinecraftButton";
import ToggleSection from "../components/ToggleSection";
import { useAppState } from "../contexts/AppState";
import { getMinecraftFolder } from "../VersionSwitcher/VersionManager";
const fs = window.require('fs') as typeof import('fs');
const child = window.require('child_process') as typeof import('child_process')

export default function SettingsPage() {
    const { keepLauncherOpen, setKeepLauncherOpen, developerMode, setDeveloperMode } = useAppState()

    const openModsFolder = () => {
        // Don't reveal in explorer unless there is an existing minecraft folder
        if (!fs.existsSync(getMinecraftFolder())) {
            alert("Minecraft is not currently installed");
            return;
        }

        const folder = getMinecraftFolder() + "\\AC\\Amethyst\\mods\\";

        if (!fs.existsSync(folder)) fs.mkdirSync(folder, { recursive: true });

        const startGameCmd = `explorer "${folder}"`;
        child.spawn(startGameCmd, { shell: true })
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
                text="Developer mode"
                subtext="Enables hot-reloading and prompting to attach a debugger."
                isChecked={developerMode}
                setIsChecked={setDeveloperMode}
            />
            <DividedSection className="flex-grow flex justify-around gap-[8px]">
                <div className="h-full flex flex-col"></div>
            </DividedSection>
            <DividedSection>
                <MinecraftButton text="Open Mods Folder" onClick={openModsFolder} />
            </DividedSection>
        </MainPanel>
    )
}