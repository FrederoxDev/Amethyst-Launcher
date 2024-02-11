import MainPanel from "../components/MainPanel";
import ToggleSection from "../components/ToggleSection";
import { useAppState } from "../contexts/AppState";

export default function SettingsPage() {
    const { keepLauncherOpen, setKeepLauncherOpen, developerMode, setDeveloperMode } = useAppState()

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
        </MainPanel>
    )
}