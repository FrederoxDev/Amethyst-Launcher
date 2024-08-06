import React, { useCallback, useEffect, useMemo, useState } from 'react'
import Panel from '../components/Panel'
import TextInput from '../components/TextInput'
import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { GetDefaultVersionPath, GetLatestVersion, Version } from '../scripts/types/Version'
import Shard, { FindExtraShard, FindExtraShards } from '../scripts/types/Shard'
import { ipcRenderer } from 'electron'

export default function ProfileEditor() {
  const [profile_name, SetProfileName] = useState('')
  const [profile_mods, SetProfileMods] = useState<Shard.Extra[] | undefined>(undefined)
  const [profile_runtime, SetProfileRuntime] = useState<Shard.Extra | undefined>(undefined)
  const [profile_version, SetProfileVersion] = useState<Version.Cached>(GetLatestVersion)
  const [profile_path, SetProfilePath] = useState<string>(GetDefaultVersionPath)

  const [sub_page, SetSubPage] = useState<string>('Mods')

  const { mods, runtimes, versions, profiles, active_profile, SetActiveProfile, SaveState } = UseAppState()
  const navigate = useNavigate()

  const profile = useMemo(() => {
    if (active_profile !== undefined) return profiles[active_profile]
  }, [profiles, active_profile])

  useMemo(() => {
    if (profile) {
      SetProfileName(profile.name)
      SetProfileVersion(profile.version)

      if (profile.version.path) {
        SetProfilePath(profile.version.path)
      }

      if (profile.runtime) {
        const runtime_extra = FindExtraShard(profile.runtime)
        SetProfileRuntime(runtime_extra)
      }

      if (profile.mods) {
        const mods_extra = FindExtraShards(profile.mods)
        SetProfileMods(mods_extra)
      }

      if (profile.runtime === undefined) {
        SetSubPage('Settings')
      }
    }
  }, [profile])

  useEffect(() => {
    if (profile === undefined) {
      navigate('/profile-manager')
    }
  })

  const ModButton = useCallback(
    (
      mod: Shard.Extra,
      active: boolean,
      index: number,
      selected_mod: Shard.Extra | undefined,
      SetSelectedMod: (index: Shard.Extra | undefined) => void
    ) => {
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
        if (is_selected) {
          SetSelectedMod(undefined)
        }

        if (profile_mods) {
          const active_mod_uuids = profile_mods.map(m => m.manifest.meta.uuid)

          if (active_mod_uuids.includes(mod.manifest.meta.uuid)) {
            const active = profile_mods.filter(m => m.manifest.meta.uuid !== mod.manifest.meta.uuid)
            SetProfileMods(active)
          } else {
            SetProfileMods([...profile_mods, mod])
          }
        }
        // no active mods, so this mod must be toggling to active. just add it to the active mods
        else {
          SetProfileMods([mod])
        }
      }

      const is_selected = selected_mod
        ? mod.manifest.meta.uuid === selected_mod.manifest.meta.uuid &&
        mod.manifest.meta.version === selected_mod.manifest.meta.version
        : false

      return (
        <div key={index}>
          <div className="list_item flex flex-row">
            <div
              className="flex flex-grow inset_button cursor-pointer"
              onClick={() => SetSelectedMod(is_selected ? undefined : mod)}
            >
              <div className="flex flex-row w-full justify-between items-center p-[8px]">
                <div className="flex flex-row gap-[8px]">
                  <div className="w-[30px] h-[30px] border-[3px] border-[#1E1E1F] box-content">
                    <img src={icon_path} className="w-full h-full pixelated" alt="" />
                  </div>
                  <p className="minecraft-seven text-white text-[14px]">{mod.manifest.meta.name}</p>
                  <p className="minecraft-seven text-[#B1B2B5] text-[14px]">{mod.manifest.meta.version}</p>
                </div>
                <div className="w-[30px] h-[30px] p-[10px]">
                  <img
                    src={is_selected ? `/images/icons/chevron-up.png` : `/images/icons/chevron-down.png`}
                    className="w-full h-full pixelated"
                    alt=""
                  />
                </div>
              </div>
            </div>
            <div
              className="w-[58px] h-[58px] p-[8px] flex justify-center items-center inset_button cursor-pointer"
              onClick={() => ToggleMod(mod)}
            >
              {active ? (
                <img src="/images/icons/remove.png" className="pixelated" alt="" />
              ) : (
                <img src="/images/icons/add.png" className="pixelated" alt="" />
              )}
            </div>
          </div>
          <div
            className={`flex flex-col p-[8px] bg-[#313233] border-[3px] m-[-3px] border-[#1e1e1f] overflow-hidden ${is_selected ? '' : 'hidden'}`}
          >
            <p
              className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              {typeof mod.manifest.meta.author === 'string'
                ? 'Author: ' + mod.manifest.meta.author
                : 'Authors: ' + mod.manifest.meta.author.join(', ')}
            </p>
            <p
              className="minecraft-seven text-[#B1B2B5] text-[14px] leading-tight min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
              {mod.manifest.meta.description ? 'Description: ' + mod.manifest.meta.description : ''}
            </p>
          </div>
        </div>
      )
    },
    [profile_mods]
  )

  useMemo(() => {
    if (profile) {
      profile.name = profile_name
      profile.version = { ...profile_version, path: profile_path }

      if (profile_runtime) {
        profile.runtime = Shard.Extra.toReference(profile_runtime)
        if (profile_mods) {
          profile.mods = profile_mods.map(m => Shard.Extra.toReference(m))
        } else {
          profile.mods = undefined
        }
      } else {
        profile.runtime = undefined
        profile.mods = undefined
      }

      SaveState()
    }
  }, [SaveState, profile, profile_mods, profile_name, profile_runtime, profile_version, profile_path])

  const DeleteProfile = () => {
    if (active_profile !== undefined) {
      profiles.splice(active_profile, 1)
      SetActiveProfile(profiles.length - 1)
    }

    navigate('/profile-manager')

    SaveState()
  }

  const [version_uuids, version_names, version_options] = useMemo(() => {
    const version_options = versions.filter(ver => ver.format === Version.Format.Release).reverse()
    const version_uuids = version_options.map(v => v.uuid)
    const version_names = version_options.map(v => Version.Cached.toString(v))

    return [version_uuids, version_names, version_options]
  }, [versions])

  const [runtime_names, runtime_options, runtime_index] = useMemo(() => {
    const runtime_options = [undefined, ...runtimes]

    const runtime_names = runtime_options.map(r => {
      if (r) {
        return r.manifest.meta.name
      } else return 'Vanilla'
    })

    const runtime_uuids = runtime_options.map(r => {
      if (r) {
        return r.manifest.meta.uuid
      } else return ''
    })

    const runtime_index = profile_runtime !== undefined ? runtime_uuids.indexOf(profile_runtime.manifest.meta.uuid) : 0

    return [runtime_names, runtime_options, runtime_index]
  }, [profile_runtime, runtimes])

  const [active_mods, inactive_mods] = useMemo(() => {
    if (profile_mods) {
      const active_mod_uuids = profile_mods.map(m => m.manifest.meta.uuid)

      const active_mods = mods.filter(mod => {
        return active_mod_uuids.includes(mod.manifest.meta.uuid)
      })

      const inactive_mods = mods.filter(mod => {
        return !active_mod_uuids.includes(mod.manifest.meta.uuid)
      })

      return [active_mods, inactive_mods]
    } else {
      return [[], mods]
    }
  }, [mods, profile_mods])

  const [selected_active_mod, SetSelectedActiveMod] = useState<Shard.Extra | undefined>(undefined)
  const [selected_inactive_mod, SetSelectedInactiveMod] = useState<Shard.Extra | undefined>(undefined)

  const SelectPath = useCallback(() => {
    const args: Electron.OpenDialogOptions = {
      defaultPath: profile_path,
      properties: ['openDirectory']
    }

    ipcRenderer.invoke('show-dialog', args).then((result: Electron.OpenDialogReturnValue) => {
      if (result.canceled) return
      else {
        const path = result.filePaths[0]

        SetProfilePath(path)
      }
    })
  }, [profile_path])

  return (
    <Panel>
      <div className=" w-full h-full flex flex-col gap-[8px] overflow-hidden">
        <div className="flex flex-row gap-[8px] h-[54px]">
          <div className="w-[54px] h-full border-[3px] border-[#1E1E1F]">
            <img
              src={profile?.icon_path ?? `/images/icons/earth-icon.png`}
              className="w-full h-full pixelated"
              alt=""
            />
          </div>
          <div className="flex flex-row flex-grow gap-[-3px]">
            <div className="flex flex-row flex-grow h-full border-[3px] border-[#1E1E1F] bg-[#48494a] overflow-hidden">
              <div className="flex flex-row flex-grow justify-between">
                <div className="flex flex-col p-[8px] gap-[2px]">
                  <p className="minecraft-seven text-white text-[18px]">{profile_name}</p>
                  <p
                    className="minecraft-seven text-[#B1B2B5] text-[12px] mt-auto">{`${Version.Cached.toString(profile_version)} (${profile_runtime?.manifest.meta.name ?? 'Vanilla'})`}</p>
                </div>
                <div className="flex flex-row border-[3px] my-[4px] border-[#1E1E1F] bg-[#48494a] overflow-hidden">
                  {profile_runtime !== undefined &&
                    (sub_page === 'Mods' ? (
                      <div className="flex justify-center p-[6px] bg-[#48494A] border-[3px] border-[#48494A]">
                        <p className="minecraft-seven text-white text-[14px]">{'Mods'}</p>
                      </div>
                    ) : (
                      <div
                        className="flex justify-center p-[6px] inset_button cursor-pointer"
                        onClick={() => SetSubPage('Mods')}
                      >
                        <p className="minecraft-seven text-white text-[14px]">{'Mods'}</p>
                      </div>
                    ))}
                  {sub_page === 'Settings' ? (
                    <div className="flex justify-center p-[6px] bg-[#48494A] border-[3px] border-[#48494A]">
                      <p className="minecraft-seven text-white text-[14px]">{'Settings'}</p>
                    </div>
                  ) : (
                    <div
                      className="flex justify-center p-[6px] inset_button cursor-pointer"
                      onClick={() => SetSubPage('Settings')}
                    >
                      <p className="minecraft-seven text-white text-[14px]">{'Settings'}</p>
                    </div>
                  )}
                </div>
              </div>
              <div
                className="flex p-[8px] w-[48px] h-full justify-center items-center cursor-pointer"
                onClick={() => navigate('/profile-manager')}
              >
                <img src="/images/icons/close-icon.png" className="w-[24px] h-[24px] pixelated" alt="" />
              </div>
            </div>
          </div>
        </div>

        {sub_page === 'Mods' && (
          <>
            <div className="content_panel h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
              <div className="flex flex-col gap-[24px]">
                <div className="flex flex-col w-full">
                  <div className="flex flex-row w-full">
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
                    {active_mods.length > 0 ? (
                      active_mods.map((mod, index) => {
                        return ModButton(mod, true, index, selected_active_mod, SetSelectedActiveMod)
                      })
                    ) : (
                      <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                        <p className="minecraft-seven text-[14px] text-white">No active mods</p>
                        <p className="minecraft-seven text-[14px] text-[#B1B2B5]">
                          Activate a mod by clicking on it in the "Inactive Mods" list
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex flex-col w-full">
                  <div className="flex flex-row w-full">
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
                    {inactive_mods.length > 0 ? (
                      inactive_mods.map((mod, index) => {
                        return ModButton(mod, false, index, selected_inactive_mod, SetSelectedInactiveMod)
                      })
                    ) : (
                      <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                        <p className="minecraft-seven text-[14px] text-white">All available mods active</p>
                        <p className="minecraft-seven text-[14px] text-[#B1B2B5]">
                          All available mods have already been activated
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}

        {sub_page === 'Settings' && (
          <>
            <div
              className="flex flex-col border-[3px] border-[#1E1E1F] bg-[#48494A] flex-shrink h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
              <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <TextInput label="Profile name" text={profile_name} setText={SetProfileName} />
              </div>

              <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <Dropdown
                  labelText="Version"
                  default_index={version_uuids.indexOf(profile_version.uuid)}
                  SetIndex={index => {
                    SetProfileVersion(version_options[index])
                  }}
                  // we don't support non-release versions right now so only show release lmao
                  options={version_names}
                  id="minecraft-version"
                />
              </div>

              <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <Dropdown
                  labelText="Runtime"
                  default_index={runtime_index}
                  SetIndex={index => {
                    if (runtime_options[index]) {
                      SetProfileRuntime(runtime_options[index])
                    } else SetProfileRuntime(undefined)
                  }}
                  options={runtime_names}
                  id="runtime-mod"
                />
              </div>
              <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <div className="flex flex-col gap-[4px]">
                  <p className="minecraft-seven text-white text-[14px]">{'Install Directory'}</p>
                  <div className="flex flex-row flex-grow gap-[3px]">
                    <div
                      className="min-w-0 flex flex-grow border-[3px] h-[25px] border-[#1E1E1F] bg-[#313233] justify-center p-[4px]">
                      <p
                        className="w-full minecraft-seven bg-transparent text-white text-[12px] min-w-0 overflow-ellipsis overflow-hidden whitespace-nowrap">
                        {profile_path}
                      </p>
                    </div>
                    <div
                      className="flex shrink-0 border-[3px] h-[25px] border-[#1E1E1F] bg-[#313233] justify-center p-[4px] cursor-pointer"
                      onClick={SelectPath}
                    >
                      <img src={'/images/icons/open-icon.png'} alt="" />
                    </div>
                  </div>
                </div>
              </div>
              <div className="border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <MinecraftButton
                  text="Delete Profile"
                  style={MinecraftButtonStyle.Warn}
                  onClick={() => DeleteProfile()}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </Panel>
  )
}
