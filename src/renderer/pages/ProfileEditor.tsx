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
import Shard, { GetShards } from '../scripts/types/Shard'

export default function ProfileEditor() {
  const [profile_name, SetProfileName] = useState('')
  const [profile_mods, SetProfileMods] = useState<Shard.Reference[] | undefined>(undefined)
  const [profile_runtime, SetProfileRuntime] = useState<Shard.Reference | undefined>(undefined)
  const [profile_version, SetProfileVersion] = useState<Version>(GetLatestVersion)
  // const [profile_path, SetProfilePath] = useState<string>(GetDefaultVersionPath)

  const [sub_page, SetSubPage] = useState<string>('Mods')

  const { mods, runtimes, versions, profiles, SetProfiles, selected_profile, SaveState, SetMods } = UseAppState()
  const navigate = useNavigate()

  const profile = useMemo(() => {
    return profiles[selected_profile]
  }, [profiles, selected_profile])

  useEffect(() => {
    if (profile) {
      SetProfileName(profile.name)
      SetProfileRuntime(profile.runtime)
      SetProfileMods(profile.mods)
      SetProfileVersion(profile.version)
    }

    if (profile === undefined) {
      navigate('/profile-manager')
    }
    if (profile_runtime === undefined) {
      SetSubPage('Settings')
    }
  }, [navigate, profile, profile_runtime])


  const ToggleMod = useCallback((mod: Shard.Manifest) => {
    if (profile_mods) {

      const active_mod_uuids = profile_mods.map(m => m.uuid)

      if (active_mod_uuids.includes(mod.meta.uuid)) {
        const newActive = profile_mods.filter(m => m.uuid !== mod.meta.uuid)
        SetProfileMods(newActive)
      } else {
        const newActive = [...profile_mods, Shard.Manifest.toFragment(mod)]
        SetProfileMods(newActive)
      }
    }
    // no active mods, so this mod must be toggling to active. just add it to the active mods
    else {
      const newActive = [Shard.Manifest.toFragment(mod)]
      console.log(newActive)
      SetProfileMods(newActive)
    }
  }, [profile_mods])

  const ModButton = useCallback(({ mod }: { mod: Shard.Manifest }) => {
    return (
      <ListItem className="cursor-pointer" onClick={() => ToggleMod(mod)}>
        <div className="p-[4px]">
          <p className="minecraft-seven text-white">{mod.meta.name}</p>
        </div>
      </ListItem>
    )
  }, [ToggleMod])

  const SaveProfile = () => {
    if (profile_runtime) {

      const runtime_uuids = runtimes.map(r => r.meta.uuid)

      if (!runtime_uuids.includes(profile_runtime.uuid)) {
        SetProfileRuntime(undefined)
      }
    }

    if (profile_mods) {
      const mod_uuids = mods.map(m => m.meta.uuid)

      const newMods = profile_mods.filter(mod => mod_uuids.includes(mod.uuid))
      SetProfileMods(newMods)
    }

    profiles[selected_profile].name = profile_name
    profiles[selected_profile].runtime = profile_runtime
    profiles[selected_profile].mods = profile_mods
    profiles[selected_profile].version = profile_version

    SaveState()
    navigate('/profile-manager')
  }

  const DeleteProfile = () => {
    profiles.splice(selected_profile, 1)
    SetProfiles(profiles)

    SaveState()
    navigate('/profile-manager')
  }

  useEffect(() => {
    const shards = GetShards()

    SetMods(shards.filter(s => s.meta.format === 0 || s.meta.format === undefined))
  }, [SetMods])

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
        return r.meta.name
      } else return 'Vanilla'
    })

    const runtime_uuids =  runtime_options.map(r => {
      if (r) {
        return r.meta.uuid
      }
      else return ''
    })

    const runtime_index = profile_runtime !== undefined ? runtime_uuids.indexOf(profile_runtime.uuid) : 0

    return [runtime_names, runtime_options, runtime_index]
  }, [profile_runtime, runtimes])

  const [active_mods, inactive_mods]: [Shard.Manifest[], Shard.Manifest[]] = useMemo(() => {
    if (profile_mods) {
      const active_mod_uuids = profile_mods.map(m => m.uuid)

      const active_mods = mods.filter(mod => {
        return active_mod_uuids.includes(mod.meta.uuid)
      })

      const inactive_mods = mods.filter(mod => {
        return !active_mod_uuids.includes(mod.meta.uuid)
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
                  <p className="minecraft-seven text-[#B1B2B5] text-[12px] mt-auto">{`${profile_runtime?.name ?? 'Vanilla'} ${profile_version.sem_version}`}</p>
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
        <div className="content_panel">
          { sub_page === 'Settings' && (
            <>
              {/* Settings */}
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
                      SetProfileRuntime(Shard.Manifest.toFragment(runtime_options[index]))
                    } else SetProfileRuntime(undefined)
                  }}
                  options={runtime_names}
                  id="runtime-mod"
                />
                {/*<TextInput label="Install Directory" text={profileInstallDir} setText={setProfileInstallDir} />*/}
              </div>

              {/* Mod Selection */}
              {profile_runtime === undefined ? (
                <div className="flex-grow flex justify-around">
                  <div className="h-full flex flex-col"></div>
                </div>
              ) : (
                <div className="bg-[#48494a] flex-grow flex justify-around gap-[8px]">
                  <div className="w-[50%] h-full flex flex-col">
                    <p className="text-white minecraft-seven text-[14px]">Active Mods</p>
                    <List>
                      {
                        active_mods.map((mod, index) => {
                          return <ModButton mod={mod} key={index} />
                        })
                      }
                    </List>
                  </div>
                  <div className=" w-[50%] h-full flex flex-col">
                    <p className="text-white minecraft-seven text-[14px]">Inactive Mods</p>
                    <List>
                      {
                        inactive_mods.map((mod, index) => {
                          return <ModButton mod={mod} key={index} />
                        })
                      }
                    </List>
                  </div>
                </div>
              )}

              {/* Profile Actions */}
              <div className="flex justify-around gap-[8px]">
                <MinecraftButton text="Save Profile" onClick={() => SaveProfile()} />
                <MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn} onClick={() => DeleteProfile()} />
              </div>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}
