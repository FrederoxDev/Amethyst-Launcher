import { UseAppState } from '../contexts/AppState'
import { IsDownloaded, IsRegistered } from '../scripts/functions/VersionManager'
import { GetPackagePath } from '../scripts/functions/AppRegistry'
import { FilePaths, FolderPaths } from '../scripts/Paths'
import { IsDevModeEnabled } from '../scripts/functions/DeveloperMode'
import ReadOnlyTextBox from '../components/ReadOnlyTextBox'
import { useEffect, useState } from 'react'
import MinecraftToggle from '../components/MinecraftToggle'
import MinecraftRadialButtonPanel from '../components/MinecraftRadialButtonPanel'

import * as fs from 'fs'
import { Version } from '../scripts/types/Version'

export default function Settings() {
  const { keep_launcher_open, SetKeepLauncherOpen, developer_mode, SetDeveloperMode, ui_theme, SetUITheme } =
    UseAppState()

  const { profiles, selected_profile } = UseAppState()
  const [launcherCfg, setLauncherCfg] = useState<string>('')

  const profile = profiles[selected_profile]
  let isVerDownloaded = false
  let isRegisteredVerOurs = false
  let installDir = ''

  const isWindowsDevModeOn = IsDevModeEnabled()

  if (profile) {
    isVerDownloaded = IsDownloaded(profile.version)
    isRegisteredVerOurs = IsRegistered(profile.version)
    installDir = GetPackagePath() ?? 'Could not find installed.'
  }

  const updateCfgText = () => {
    if (!fs.existsSync(FilePaths.RuntimeConfig)) {
      setLauncherCfg('Launcher config does not exist...')
      return
    }

    const data = fs.readFileSync(FilePaths.RuntimeConfig, 'utf-8')
    setLauncherCfg(data)
  }

  useEffect(() => {
    const timer = setTimeout(updateCfgText, 0)
    return () => clearTimeout(timer)
  }, [profiles, selected_profile, keep_launcher_open, developer_mode, ui_theme])

  return (
    <div
      className="flex flex-col h-fit max-h-full border-[3px] border-[#1E1E1F] bg-[#48494a] overflow-y-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[4px]">
            <p className="minecraft-seven text-white text-[14px]">{'Keep launcher open'}</p>
            <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
              {'Prevents the launcher from closing after launching the game.'}
            </p>
          </div>
          <MinecraftToggle isChecked={keep_launcher_open} setIsChecked={SetKeepLauncherOpen} />
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-[4px]">
            <p className="minecraft-seven text-white text-[14px]">{'Developer mode'}</p>
            <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
              {'Enables hot-reloading and prompting to attach a debugger.'}
            </p>
          </div>
          <MinecraftToggle isChecked={developer_mode} setIsChecked={SetDeveloperMode} />
        </div>
      </div>

      <div className="flex flex-col gap-[8px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <p className="minecraft-seven text-white text-[14px]">UI Theme</p>
        <MinecraftRadialButtonPanel
          elements={[
            { text: 'Light', value: 'Light' },
            { text: 'Dark', value: 'Dark' },
            { text: 'System', value: 'System' }
          ]}
          default_selected_value={ui_theme}
          onChange={value => {
            SetUITheme(value)
          }}
        />
      </div>

      <div className="flex flex-col gap-[8px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px] minecraft-seven text-[#BCBEC0] text-[14px] shrink-0 overflow-x-hidden">
        <p className="text-white">Debug Info</p>
        <div className="flex flex-col gap-[8px]">
          <div className="flex flex-col gap-[2px]">
            <p>Version: {profile?.version ? Version.toString(profile.version) : 'No version found.'}</p>
            <p>Downloaded: {isVerDownloaded ? 'true' : 'false'}</p>
            <p>Registered: {isRegisteredVerOurs ? 'true' : 'false'}</p>
            <p>Path: {installDir}</p>
          </div>

          <p>Developer Mode: {isWindowsDevModeOn ? 'true' : 'false'}</p>

          <div className="flex flex-col gap-[2px]">
            <p>Amethyst Folder: {FolderPaths.Amethyst}</p>
            <p>Minecraft Folder: {FolderPaths.MinecraftUWP}</p>
          </div>
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <ReadOnlyTextBox text={launcherCfg ?? ' '} label="Launcher Config" />
      </div>
    </div>
  )
}
