import { AnalyticsConsent, UseAppState } from '../contexts/AppState'
import { SemVersion } from '../scripts/classes/SemVersion'
import { IsRegistered, IsDownloaded } from '../scripts/VersionManager'
import { GetPackagePath } from '../scripts/AppRegistry'
import { AmethystFolder, LauncherConfigFile, MinecraftUWPFolder } from '../scripts/Paths'
import { IsDevModeEnabled } from '../scripts/DeveloperMode'
import {ReadOnlyTextBox} from '../components/ReadOnlyTextBox'
import { useEffect, useState } from 'react'
import {MinecraftToggle} from '../components/MinecraftToggle'
import {MinecraftRadialButtonPanel} from '../components/MinecraftRadialButtonPanel'

import * as fs from 'fs'

export function SettingsPage() {
  const { keepLauncherOpen, setKeepLauncherOpen, developerMode, setDeveloperMode, UITheme, setUITheme } = UseAppState()

  const { allProfiles, selectedProfile, allMinecraftVersions, analyticsConsent, setAnalyticsConsent } = UseAppState()
  const [launcherCfg, setLauncherCfg] = useState<string>('')

  const profile = allProfiles[selectedProfile]
  let minecraftVersion = undefined
  let isVerDownloaded = false
  let isRegisteredVerOurs = false
  let installDir = ''

  const isWindowsDevModeOn = IsDevModeEnabled()

  if (profile) {
    const semVersion = SemVersion.fromString(profile.minecraft_version)
    minecraftVersion = allMinecraftVersions.find(version => version.version.toString() === semVersion.toString())

    if (minecraftVersion) {
      isVerDownloaded = IsDownloaded(minecraftVersion.version)
      isRegisteredVerOurs = IsRegistered(minecraftVersion)
      installDir = GetPackagePath() ?? 'Could not find installed.'
    }
  }

  const updateCfgText = () => {
    if (!fs.existsSync(LauncherConfigFile)) {
      setLauncherCfg('Launcher config does not exist...')
      return
    }

    const data = fs.readFileSync(LauncherConfigFile, 'utf-8')
    setLauncherCfg(data)
  }

  useEffect(() => {
    const timer = setTimeout(updateCfgText, 0)
    return () => clearTimeout(timer)
  }, [allProfiles, selectedProfile, keepLauncherOpen, developerMode, UITheme])

  return (
    <div
      className="flex flex-col h-fit max-h-full border-[3px] border-[#1E1E1F] bg-[#48494a] overflow-y-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <div className="flex items-center justify-center">
          <div>
            <p className="minecraft-seven text-white text-[14px]">{'Analytics Consent'}</p>
            <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
              {'Send anonymous usage data to help improve the launcher.'}
            </p>
          </div>
          <div className="ml-auto">
            <MinecraftToggle isChecked={analyticsConsent === AnalyticsConsent.Accepted} setIsChecked={(isChecked) => {
              // Re-give them the option to choose again
              console.log('Setting analytics consent to unknown')
              if (!isChecked) {
                setAnalyticsConsent(AnalyticsConsent.Declined);
                return;
              }
              setAnalyticsConsent(AnalyticsConsent.Unknown);
            }} />
          </div>
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <div className="flex items-center justify-center">
          <div>
            <p className="minecraft-seven text-white text-[14px]">{'Keep launcher open'}</p>
            <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
              {'Prevents the launcher from closing after launching the game.'}
            </p>
          </div>
          <div className="ml-auto">
            <MinecraftToggle isChecked={keepLauncherOpen} setIsChecked={setKeepLauncherOpen} />
          </div>
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <div className="flex items-center justify-center">
          <div>
            <p className="minecraft-seven text-white text-[14px]">{'Developer mode'}</p>
            <p className="minecraft-seven text-[#BCBEC0] text-[12px]">
              {'Enables hot-reloading and prompting to attach a debugger.'}
            </p>
          </div>
          <div className="ml-auto">
            <MinecraftToggle isChecked={developerMode} setIsChecked={setDeveloperMode} />
          </div>
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <p className="minecraft-seven text-white text-[14px]">UI Theme</p>
        <MinecraftRadialButtonPanel
          elements={[
            { text: 'Light', value: 'Light' },
            { text: 'Dark', value: 'Dark' },
            { text: 'System', value: 'System' }
          ]}
          default_selected_value={UITheme}
          onChange={value => {
            setUITheme(value)
          }}
        />
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px] minecraft-seven text-[#BCBEC0] text-[14px] shrink-0 overflow-x-hidden">
        <p className="text-white">Debug Info</p>
        <p>Minecraft Version: {minecraftVersion ? minecraftVersion.toString() : 'No version found.'}</p>
        <p>Is version downloaded: {isVerDownloaded ? 'true' : 'false'}</p>
        <p>Is Registered Version Ours: {isRegisteredVerOurs ? 'true' : 'false'}</p>
        <p>Is windows developer mode: {isWindowsDevModeOn ? 'enabled' : 'disabled'}</p>
        <p>Install path: {installDir}</p>
        <p>Amethyst Folder: {AmethystFolder}</p>
        <p>Minecraft Folder: {MinecraftUWPFolder}</p>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <ReadOnlyTextBox text={launcherCfg ?? ' '} label="Launcher Config" />
      </div>
    </div>
  )
}
