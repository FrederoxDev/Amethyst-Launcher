import { useCallback, useEffect, useState } from 'react'
import Panel from '../components/Panel'
import TextInput from '../components/TextInput'
import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { GetLatestVersion, Version } from '../scripts/types/Version'
import ListItem from '../components/ListItem'
import List from '../components/List'
import Shard, { GetShards } from '../scripts/types/Shard'
import { GetProfiles } from '../scripts/types/Profile'
// import { GetDefaultInstallPath } from '../scripts/VersionManager'

export default function ProfileEditor() {
  const [profileName, setProfileName] = useState('')
  const [profileActiveMods, setProfileActiveMods] = useState<Shard.Fragment[] | undefined>([])
  const [profileRuntime, setProfileRuntime] = useState<Shard.Fragment | undefined>(undefined)
  const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<Version>(GetLatestVersion())
  // const [profileInstallDir, setProfileInstallDir] = useState<string>(GetDefaultInstallPath())

  const { mods, runtimes, versions, profiles, SetProfiles, selected_profile, saveData, SetMods } = UseAppState()
  const navigate = useNavigate()

  if (profiles.length === 0) navigate('/profile-manager')

  const toggleModActive = (mod: Shard.Manifest) => {
    if (profileActiveMods) {

      const active_mod_uuids = profileActiveMods.map(m => m.uuid)

      if (active_mod_uuids.includes(mod.meta.uuid)) {
        const newActive = profileActiveMods.filter(m => m.uuid !== mod.meta.uuid)
        setProfileActiveMods(newActive)
      } else {
        const newActive = [...profileActiveMods, Shard.Manifest.toFragment(mod)]
        setProfileActiveMods(newActive)
      }
    }
    // no active mods, so this mod must be toggling to active. just add it to the active mods
    else {
      const newActive = [Shard.Manifest.toFragment(mod)]
      console.log(newActive)
      setProfileActiveMods(newActive)
    }
  }

  const ModButton = ({ mod }: { mod: Shard.Manifest }) => {
    return (
      <ListItem
        className="cursor-pointer"
        onClick={() => {
          if (profileRuntime === undefined) {
            alert('Cannot add mods to a vanilla profile')
            return
          }

          toggleModActive(mod)
        }}
      >
        <div className="p-[4px]">
          <p className="minecraft-seven text-white">{mod.meta.name}</p>
        </div>
      </ListItem>
    )
  }

  const loadProfile = useCallback(() => {
    const profile = GetProfiles()[selected_profile]

    if (profile) {
      setProfileName(profile.name)
      setProfileRuntime(profile.runtime)
      setProfileActiveMods(profile.mods)
      setProfileMinecraftVersion(profile.version)
    }

  }, [selected_profile])

  const saveProfile = () => {


    if (profileRuntime) {

      const runtime_uuids = runtimes.map(r => r.meta.uuid)

      if (!runtime_uuids.includes(profileRuntime.uuid)) {
        setProfileRuntime(undefined)
      }
    }

    if (profileActiveMods) {
      const mod_uuids = mods.map(m => m.meta.uuid)

      const newMods = profileActiveMods.filter(mod => mod_uuids.includes(mod.uuid))
      setProfileActiveMods(newMods)
    }

    profiles[selected_profile].name = profileName
    profiles[selected_profile].runtime = profileRuntime
    profiles[selected_profile].mods = profileActiveMods
    profiles[selected_profile].version = profileMinecraftVersion

    saveData()
    navigate('/profile-manager')
  }

  const deleteProfile = () => {
    profiles.splice(selected_profile, 1)
    SetProfiles(profiles)

    saveData()
    navigate('/profile-manager')
  }

  useEffect(() => {
    const shards = GetShards()

    SetMods(shards.filter(s => s.meta.format === 0 || s.meta.format === undefined))
  }, [SetMods])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  const release_versions = versions.filter(ver => ver.format === Version.Format.Release)
  const version_uuids = release_versions.map(v => v.uuid)
  const version_names = release_versions.map(v => Version.toString(v))

  const runtime_options = [undefined, ...runtimes]
  const runtime_names = runtime_options.map(r => {
    if (r) {
      return r.meta.name
    }
    else return 'Vanilla'
  })
  const runtime_uuids = runtime_options.map(r => {
    if (r) {
      return r.meta.uuid
    }
    else return ''
  })

  let runtime_index = 0
  if (profileRuntime) {
    runtime_index = runtime_uuids.indexOf(profileRuntime.uuid)
  }

  let active_mods: Shard.Manifest[] = []
  let inactive_mods: Shard.Manifest[] = mods

  if (profileActiveMods) {
    const active_mod_uuids = profileActiveMods.map(m => m.uuid)

    active_mods = mods.filter(mod => {
      return active_mod_uuids.includes(mod.meta.uuid)
    })

    inactive_mods = mods.filter(mod => {
      return !active_mod_uuids.includes(mod.meta.uuid)
    })
  }
  
  return (
    <Panel>
      <div className="flex flex-col gap-[8px] w-full h-full">
        <div className="w-full shrink-0">
          <div className="content_panel">
            <div className="flex flex-row gap-[8px]">
              <div className="w-[40px] h-[40px] border-[3px] border-[#1E1E1F] box-content">
                <img src={profiles[selected_profile]?.icon_path ?? `/images/icons/earth-icon.png`} className="w-full h-full pixelated" alt="" />
              </div>
              <div className="flex flex-col gap-[2px] justify-center">
                <p className="minecraft-seven text-white text-[16px]">{profiles[selected_profile]?.name}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px]">{`${profiles[selected_profile]?.runtime?.name ?? 'Vanilla'}  ${ profiles[selected_profile]?.version.sem_version }`}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="content_panel">
          {/* Settings */}
          <div className="flex flex-col gap-[8px]">
            <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
            <Dropdown
              labelText="Minecraft Version"
              default_index={version_uuids.indexOf(profileMinecraftVersion.uuid)}
              SetIndex={
                (index) => {
                  setProfileMinecraftVersion(release_versions[index])
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
                  setProfileRuntime(Shard.Manifest.toFragment(runtime_options[index]))
                }
                else setProfileRuntime(undefined)
              }}
              options={runtime_names}
              id="runtime-mod"
            />
            {/*<TextInput label="Install Directory" text={profileInstallDir} setText={setProfileInstallDir} />*/}
          </div>

          {/* Mod Selection */}
          {profileRuntime === undefined ? (
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
            <MinecraftButton text="Save Profile" onClick={() => saveProfile()} />
            <MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn} onClick={() => deleteProfile()} />
          </div>
        </div>
      </div>
    </Panel>
  )
}
