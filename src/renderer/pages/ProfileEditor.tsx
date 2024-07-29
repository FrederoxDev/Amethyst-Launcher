import { useCallback, useEffect, useMemo, useState } from 'react'
import Panel from '../components/Panel'
import TextInput from '../components/TextInput'
import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { /** GetDefaultVersionPath, */ GetLatestVersion, Version } from '../scripts/types/Version'
import ListItem from '../components/ListItem'
import List from '../components/List'
import Shard, { FindExtraShard, FindExtraShards } from '../scripts/types/Shard'

export default function ProfileEditor() {
  const [profile_name, SetProfileName] = useState('')
  const [profile_mods, SetProfileMods] = useState<Shard.Extra[] | undefined>(undefined)
  const [profile_runtime, SetProfileRuntime] = useState<Shard.Extra | undefined>(undefined)
  const [profile_version, SetProfileVersion] = useState<Version>(GetLatestVersion)
  // const [profile_path, SetProfilePath] = useState<string>(GetDefaultVersionPath)

  const [sub_page, SetSubPage] = useState<string>('Mods')

  const { mods, runtimes, versions, profiles, SetProfiles, selected_profile, SaveState } = UseAppState()
  const navigate = useNavigate()

  const profile = useMemo(() => {
    return profiles[selected_profile]
  }, [profiles, selected_profile])

  useEffect(() => {
    if (profile) {
      SetProfileName(profile.name)
      SetProfileVersion(profile.version)

      if (profile.runtime) {
        const runtime_extra = FindExtraShard(profile.runtime)
        SetProfileRuntime(runtime_extra)
      }

      if (profile.mods) {
        const mods_extra = FindExtraShards(profile.mods)
        SetProfileMods(mods_extra)
      }
    }
    else {
      navigate('/profile-manager')
    }

    if (profile.runtime === undefined) {
      SetSubPage('Settings')
    }
  }, [navigate, profile])

  // const ModButton = useCallback(({ mod }: { mod: Shard.Extra }) => {
  //   const ToggleMod = (mod: Shard.Extra) => {
  //     if (profile_mods) {
  //
  //       const active_mod_uuids = profile_mods.map(m => m.manifest.meta.uuid)
  //
  //       if (active_mod_uuids.includes(mod.manifest.meta.uuid)) {
  //         const newActive = profile_mods.filter(m => m.manifest.meta.uuid !== mod.manifest.meta.uuid)
  //         SetProfileMods(newActive)
  //       } else {
  //         const newActive = [...profile_mods, mod]
  //         SetProfileMods(newActive)
  //       }
  //     }
  //     // no active mods, so this mod must be toggling to active. just add it to the active mods
  //     else {
  //       const newActive = [mod]
  //       console.log(newActive)
  //       SetProfileMods(newActive)
  //     }
  //   }
  //
  //   return (
  //     <ListItem className="cursor-pointer" onClick={() => ToggleMod(mod)}>
  //       <div className="p-[4px]">
  //         <p className="minecraft-seven text-white">{mod.manifest.meta.name}</p>
  //       </div>
  //     </ListItem>
  //   )
  // }, [profile_mods])

  const ModButton = useCallback((mod: Shard.Extra, active: boolean, index: number, selected_index: number, SetSelectedIndex: (index: number) => void) => {
    let icon_path = mod.icon_path

    if (icon_path === undefined) {
      switch (mod.manifest.meta.format) {
        default:
          icon_path = `/images/icons/page-icon.png`
          break
        case 0:
          icon_path = `/images/icons/page-icon.png`
          break
        case 1:
          icon_path = `/images/icons/book-icon.png`
          break
      }
    }

    const ToggleMod = (mod: Shard.Extra) => {
      if (profile_mods) {

        const active_mod_uuids = profile_mods.map(m => m.manifest.meta.uuid)

        if (active_mod_uuids.includes(mod.manifest.meta.uuid)) {
          const newActive = profile_mods.filter(m => m.manifest.meta.uuid !== mod.manifest.meta.uuid)
          SetProfileMods(newActive)
        } else {
          const newActive = [...profile_mods, mod]
          SetProfileMods(newActive)
        }
      }
      // no active mods, so this mod must be toggling to active. just add it to the active mods
      else {
        const newActive = [mod]
        console.log(newActive)
        SetProfileMods(newActive)
      }
    }

    return (
      <div key={index}>
        <div className="list_item flex flex-row">
          <div className="list_item_border cursor-pointer">
            <div className="flex flex-row justify-between items-center p-[8px]">
              <div className="flex flex-row gap-[8px]">
                <div className="w-[30px] h-[30px] border-[3px] border-[#1E1E1F] box-content">
                  <img src={icon_path} className="w-full h-full pixelated" alt="" />
                </div>
                <p className="minecraft-seven text-white text-[14px]">{mod.manifest.meta.name}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px]">{mod.manifest.meta.version}</p>
              </div>
              <div className="w-[30px] h-[30px] p-[10px]">
                <img src={`/images/icons/chevron-up.png`} className="w-full h-full pixelated" alt="" />
              </div>
            </div>
          </div>
          <div className="list_item_border cursor-pointer" onClick={() => ToggleMod(mod)}>
            {
              active ? <img src="/images/icons/remove.png" alt="" /> : <img src="/images/icons/add.png" alt="" />
            }

          </div>
        </div>
      </div>
    )
  }, [profile_mods])

  const SaveProfile = () => {
    if (profile_runtime) {

      const runtime_uuids = runtimes.map(r => r.manifest.meta.uuid)

      if (!runtime_uuids.includes(profile_runtime.manifest.meta.uuid)) {
        SetProfileRuntime(undefined)
      }
    }

    if (profile_mods) {
      const mod_uuids = mods.map(m => m.manifest.meta.uuid)

      const newMods = profile_mods.filter(mod => mod_uuids.includes(mod.manifest.meta.uuid))
      SetProfileMods(newMods)
    }

    profiles[selected_profile].name = profile_name
    profiles[selected_profile].version = profile_version

    if (profile_runtime) {
      profiles[selected_profile].runtime = Shard.Extra.toReference(profile_runtime)
    }

    if (profile_mods) {
      profiles[selected_profile].mods = profile_mods.map(m => Shard.Extra.toReference(m))
    }

    SaveState()
    navigate('/profile-manager')
  }

  const DeleteProfile = () => {
    profiles.splice(selected_profile, 1)
    SetProfiles(profiles)

    SaveState()
    navigate('/profile-manager')
  }

  const [version_uuids, version_names, version_options] = useMemo(() => {
    const version_options = versions.filter(ver => ver.format === Version.Format.Release)
    const version_uuids = version_options.map(v => v.uuid)
    const version_names = version_options.map(v => Version.toString(v))

    return [version_uuids, version_names, version_options]
  }, [versions])

  const [runtime_names, runtime_options, runtime_index] = useMemo(() =>{
    const runtime_options = [undefined, ...runtimes]

    const runtime_names = runtime_options.map(r => {
      if (r) {
        return r.manifest.meta.name
      } else return 'Vanilla'
    })

    const runtime_uuids =  runtime_options.map(r => {
      if (r) {
        return r.manifest.meta.uuid
      }
      else return ''
    })

    const runtime_index = profile_runtime !== undefined ? runtime_uuids.indexOf(profile_runtime.manifest.meta.uuid) : 0

    return [runtime_names, runtime_options, runtime_index]
  }, [profile_runtime, runtimes])

  const [active_mods, inactive_mods] = useMemo(() => {
    if (profile_mods) {
      const active_mod_uuids = profile_mods.map(m => m.manifest.meta.uuid)

      const active_mods = (mods.filter(mod => {
        return active_mod_uuids.includes(mod.manifest.meta.uuid)
      }))

      const inactive_mods = mods.filter(mod => {
        return !active_mod_uuids.includes(mod.manifest.meta.uuid)
      })

      return [active_mods, inactive_mods]
    }
    else {
      return [[], mods]
    }
  }, [mods, profile_mods])
  
  return (
    <Panel>
      <div className="flex flex-col gap-[8px] w-full h-full">
        <div className="flex flex-row gap-[8px]">
          <div className="w-[48px] h-[48px] border-[3px] border-[#1E1E1F] box-content">
            <img src={profile?.icon_path ?? `/images/icons/earth-icon.png`}
                 className="w-full h-full pixelated" alt="" />
          </div>
          <div className="flex flex-row gap-[8px] justify-between flex-grow h-[48px] border-[3px] border-[#1E1E1F] bg-[#48494a] box-content overflow-hidden">
              <div className="flex flex-row gap-[8px] p-[8px] justify-between">
                <div className="flex flex-col gap-[2px]">
                  <p className="minecraft-seven text-white text-[18px]">{profile_name}</p>
                  <p className="minecraft-seven text-[#B1B2B5] text-[12px] mt-auto">{`${profile_runtime?.manifest.meta.name ?? 'Vanilla'} ${profile_version.sem_version}`}</p>
                </div>
              </div>
            <div className="flex flex-row gap-[4px] p-[4px] ">
              {
                profile_runtime !== undefined && (
                  <div className="flex w-fit border-[3px] border-[#1E1E1F] cursor-pointer"
                       onClick={() => SetSubPage('Mods')}>
                    <div className="flex justify-center p-[4px] list_item_border">
                      <p className="minecraft-seven text-white text-[14px]">{'Mods'}</p>
                    </div>
                  </div>
                )
              }
              <div className="flex w-fit border-[3px] border-[#1E1E1F] cursor-pointer"
                   onClick={() => SetSubPage('Settings')}>
                <div className="flex justify-center p-[4px] list_item_border">
                  <p className="minecraft-seven text-white text-[14px]">{'Settings'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div className="content_panel h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
          {
            sub_page === 'Mods' && (
              <>
                <div className="flex flex-col gap-[24px]">
                  <div className="flex flex-col w-full">
                    <div className="flex flex-row w-full align-bottom">
                      <div className="border-[3px] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                        <p className="minecraft-seven text-white text-[14px]">Active Mods</p>
                      </div>
                      <div className="flex flex-col grow-[1] h-fit mt-auto">
                        <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
                        <div
                          className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] border-l-[#48494a] h-[7px] grow-[1]" />
                      </div>
                    </div>

                    <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
                      {
                        active_mods.length > 0 ?
                          active_mods.map((mod, index) => {
                            return ModButton(mod, true, index)
                          })

                          :

                          <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                            <p className="minecraft-seven text-[14px] text-white">No active mods</p>
                            <p className="minecraft-seven text-[14px] text-[#B1B2B5]">Activate a mod by clicking on it in the "Inactive Mods" list</p>
                          </div>
                      }
                    </div>
                  </div>
                  <div className="flex flex-col w-full">
                    <div className="flex flex-row w-full align-bottom">
                      <div className="border-[3px] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                        <p className="minecraft-seven text-white text-[14px]">Inactive Mods</p>
                      </div>
                      <div className="flex flex-col grow-[1] h-fit mt-auto">
                        <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
                        <div
                          className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] border-l-[#48494a] h-[7px] grow-[1]" />
                      </div>
                    </div>

                    <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
                      {
                        inactive_mods.length > 0 ?
                          inactive_mods.map((mod, index) => {
                            return ModButton(mod, false, index)
                          })

                          :

                          <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                            <p className="minecraft-seven text-[14px] text-white">All available mods active</p>
                            <p className="minecraft-seven text-[14px] text-[#B1B2B5]">All available mods have already been activated</p>
                          </div>
                      }
                    </div>
                  </div>
                </div>
              </>
            )
          }

          {
            sub_page === 'Settings' && (
              <>
                <div className="flex flex-col gap-[8px]">
                  <TextInput label="Profile Name" text={profile_name} setText={SetProfileName} />
                  <Dropdown
                    labelText="Minecraft Version"
                    default_index={version_uuids.indexOf(profile_version.uuid)}
                    SetIndex={
                      (index) => {
                        SetProfileVersion(version_options[index])
                      }
                    }
                    // we don't support non-release versions right now so only show release lmao
                    options={version_names}
                    id="minecraft-version"
                  />
                  <Dropdown
                    labelText="Runtime"
                    default_index={runtime_index}
                    SetIndex={(index) => {
                      if (runtime_options[index]) {
                        SetProfileRuntime(runtime_options[index])
                      } else SetProfileRuntime(undefined)
                    }}
                    options={runtime_names}
                    id="runtime-mod"
                  />
                  {/*<TextInput label="Install Directory" text={profileInstallDir} setText={setProfileInstallDir} />*/}
                </div>

                {/* Profile Actions */}
                <div className="flex justify-around gap-[8px]">
                  <MinecraftButton text="Save Profile" onClick={() => SaveProfile()} />
                  <MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn}
                                   onClick={() => DeleteProfile()} />
                </div>
              </>
            )
          }
        </div>
      </div>
    </Panel>
  )
}
