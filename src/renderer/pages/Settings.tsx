import { UseAppState } from '../contexts/AppState'
import { IsDownloaded, IsRegistered } from '../scripts/functions/VersionManager'
import { GetPackagePath } from '../scripts/functions/AppRegistry'
import { FolderPaths } from '../scripts/Paths'
import { IsDevModeEnabled } from '../scripts/functions/DeveloperMode'
import ReadOnlyTextBox from '../components/ReadOnlyTextBox'
import { useMemo, useState } from 'react'
import MinecraftToggle from '../components/MinecraftToggle'
import MinecraftRadialButtonPanel from '../components/MinecraftRadialButtonPanel'

import { Version } from '../scripts/types/Version'

export default function Settings() {
  const { developer_mode, SetDeveloperMode, theme, SetTheme, profiles, active_profile, config, runtime_config } =
    UseAppState()

  const [config_text, SetConfigText] = useState<string>('')
  const [runtime_config_text, SetRuntimeConfigText] = useState<string>('')

  const isWindowsDevModeOn = IsDevModeEnabled()

  const profile = useMemo(() => {
    if (active_profile !== undefined) {
      return profiles[active_profile]
    }
  }, [active_profile, profiles])

  const [isVerDownloaded, isRegisteredVerOurs] = useMemo(() => {
    if (profile) {
      const isVerDownloaded = IsDownloaded(profile.version)
      const isRegisteredVerOurs = IsRegistered(profile.version)

      return [isVerDownloaded, isRegisteredVerOurs]
    } else {
      return [false, false]
    }
  }, [profile])

  const installDir = GetPackagePath() ?? 'Could not find installed.'

  useMemo(() => {
    const text = JSON.stringify(config, undefined, 4)
    SetConfigText(text)
  }, [config])

  useMemo(() => {
    const text = JSON.stringify(runtime_config, undefined, 4)
    SetRuntimeConfigText(text)
  }, [runtime_config])

  return (
    <div
      className="flex flex-col h-fit max-h-full border-[3px] border-[#1E1E1F] bg-[#48494a] overflow-y-auto"
      style={{ scrollbarWidth: 'none' }}
    >
      {/*<div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">*/}
      {/*  <div className="flex items-center justify-between">*/}
      {/*    <div className="flex flex-col gap-[4px]">*/}
      {/*      <p className="minecraft-seven text-white text-[14px]">{'Show all versions'}</p>*/}
      {/*      <p className="minecraft-seven text-[#BCBEC0] text-[12px]">*/}
      {/*        {'Enables beta and preview versions in the profile editor'}*/}
      {/*      </p>*/}
      {/*    </div>*/}
      {/*    <MinecraftToggle isChecked={show_all_versions} setIsChecked={SetShowAllVersions} />*/}
      {/*  </div>*/}
      {/*</div>*/}

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

      <div
        className="flex flex-col gap-[8px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <p className="minecraft-seven text-white text-[14px]">UI Theme</p>
        <MinecraftRadialButtonPanel
          elements={[
            { text: 'Light', value: 'Light' },
            { text: 'Dark', value: 'Dark' },
            { text: 'System', value: 'System' }
          ]}
          default_selected_value={theme}
          onChange={value => {
            SetTheme(value as 'Light' | 'Dark' | 'System')
          }}
        />
      </div>

      <div
        className="flex flex-col gap-[8px] border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px] minecraft-seven text-[#BCBEC0] text-[14px] shrink-0 overflow-x-hidden">
        <p className="text-white">Debug Info</p>
        <div className="flex flex-col gap-[8px]">
          <div className="flex flex-col gap-[2px]">
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              Version: {profile ? Version.toString(profile.version) : 'No version found.'}
            </p>
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              Downloaded: {isVerDownloaded ? 'true' : 'false'}
            </p>
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              Registered: {isRegisteredVerOurs ? 'true' : 'false'}
            </p>
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">Path: {installDir}</p>
          </div>

          <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
            Developer Mode: {isWindowsDevModeOn ? 'true' : 'false'}
          </p>

          <div className="flex flex-col gap-[2px]">
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              Amethyst Folder: {FolderPaths.Amethyst}
            </p>
            <p className="min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              Minecraft Folder: {FolderPaths.MinecraftUWP}
            </p>
          </div>
        </div>
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <ReadOnlyTextBox text={config_text ?? ' '} label="Launcher Config" />
      </div>

      <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
        <ReadOnlyTextBox text={runtime_config_text ?? ' '} label="Runtime Config" />
      </div>
    </div>
  )
}
