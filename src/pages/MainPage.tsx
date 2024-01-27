import { Router } from 'react-router-dom';
import { MinecraftVersion, VersionType } from '../types/MinecraftVersion';
import { useEffect, useState } from 'react';
import { LauncherConfig } from '../types/LauncherConfig';
import { findAllMods } from '../launcher/Modlist';
import { cacheMinecraftData, downloadVersion, extractVersion, getMinecraftFolder, isRegisteredVersionOurs, isVersionDownloaded, registerVersion, restoreMinecraftData, unregisterExisting } from '../versionSwitcher/VersionManager';
import ButtonSection from '../components/ButtonSection';
import DividedSection from '../components/DividedSection';
import Dropdown from '../components/Dropdown';
import MainPanel from '../components/MainPanel';
import ModSection from '../components/ModSection';
import ToggleSection from '../components/ToggleSection';
import { SemVersion } from '../types/SemVersion';
const child = window.require('child_process') as typeof import('child_process')
const fs = window.require('fs') as typeof import('fs');
const path = window.require('path') as typeof import('path'); 

const semVersion = new SemVersion(1, 20, 51, 1)
const minecraftVersion = new MinecraftVersion(semVersion, "58c5f0cd-09d7-4e99-a6b6-c3829fd62ac9", VersionType.Release)

const configPath = path.join(getMinecraftFolder(), "AC", "Amethyst", "launcher_config.json");
let hasInitialized = false;

export default function MainPage() {
  const [ runtimeMod, setRuntimeMod ] = useState<string>("None");
  const [ allRuntimeMods, setAllRuntimeMods ] = useState<string[]>(["None", "AmethystRuntime@1.1.0"]);

  const [ allMods, setAllMods ] = useState<string[]>(["ItemInformation@1.2.0", "Zoom@1.0.0"]);
  const [ activeMods, setActiveMods ] = useState<string[]>(["ItemInformation@1.2.0", "Zoom@1.0.0"]);

  const [ keepLauncherOpen, setKeepLauncherOpen ] = useState(true);
  const [ developerMode, setDeveloperMode ] = useState(false);

  const [ status, setStatus ] = useState("")
  const [ actionLock, setActionLock ] = useState(false)
  const [ loadingPercent, setLoadingPercent ] = useState(0);

  const readConfig = () => {
    let data: LauncherConfig = {};
    
    try {
      const jsonData = fs.readFileSync(configPath, 'utf-8');
      data = JSON.parse(jsonData);
    } catch {}

    // Update states 
    setKeepLauncherOpen(data["keep_open"] ?? true);
    setDeveloperMode(data["developer_mode"] ?? false);
    setActiveMods(data["mods"] ?? []);
    setRuntimeMod(data["runtime"] ?? "None");
  }

  const writeConfig = () => {
    const realRuntime = runtimeMod == "None" ? "" : runtimeMod;

    const config: LauncherConfig = {
      mods: activeMods,
      runtime: realRuntime,
      keep_open: keepLauncherOpen,
      developer_mode: developerMode
    }

    fs.writeFileSync(configPath, JSON.stringify(config, undefined, 4));
  }

  useEffect(() => {
    const modList = findAllMods();
    setAllRuntimeMods(["None", ...modList.runtimeMods]);
    setAllMods(modList.mods);
    readConfig();
  }, []);

  useEffect(() => {
    // Don't write the first time that we read the config values
    if (!hasInitialized) {
      hasInitialized = true;
      return;
    }

    writeConfig();
  }, [keepLauncherOpen, developerMode, activeMods, runtimeMod])

  const installGame = async () => {
    setActionLock(true);

    // Only install the game once
    if (!isVersionDownloaded(minecraftVersion)) {
      await downloadVersion(minecraftVersion, setStatus, setLoadingPercent);
      await extractVersion(minecraftVersion, setStatus, setLoadingPercent);
    }

    // Only register the game if needed
    if (!isRegisteredVersionOurs(minecraftVersion)) {
      setStatus("Copying existing minecraft data")
      cacheMinecraftData();

      setStatus("Unregistering existing version");
      await unregisterExisting();

      setStatus("Registering downloaded version");
      await registerVersion(minecraftVersion)

      setStatus("Restoring existing minecraft data")
      restoreMinecraftData();
    } 
  
    setStatus("")
    setLoadingPercent(0);
    setActionLock(false);

    const startGameCmd = `start minecraft:`;
    child.spawn(startGameCmd, { shell: true })
  }

  return (
    <div className={`select-none ${actionLock ? "cursor-wait" : ""} h-screen overflow-hidden`}>
      <MainPanel>
        <DividedSection>
          <Dropdown 
            id="runtime-mod" 
            options={allRuntimeMods}
            labelText='Runtime Mod'
            value={runtimeMod}
            setValue={setRuntimeMod}
          />
        </DividedSection>

        <ToggleSection 
          isChecked={keepLauncherOpen}
          setIsChecked={setKeepLauncherOpen}
          text='Keep launcher open'
          subtext='Prevents the launcher from closing after launching the game.'
        />

        <ToggleSection 
          isChecked={developerMode}
          setIsChecked={setDeveloperMode}
          text='Developer mode'
          subtext='Enables hot-reloading and prompting to attach a debugger.'
        />

        <ModSection actionLock={actionLock} allMods={allMods} activeMods={activeMods} setActiveMods={setActiveMods} />

        <ButtonSection launchGame={installGame} actionLock={actionLock} loadingPercent={loadingPercent} status={status} />
      </MainPanel>
    </div>
  )
}
