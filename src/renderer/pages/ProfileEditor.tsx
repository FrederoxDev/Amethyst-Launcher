import { useCallback, useEffect, useState } from 'react'
import Panel from '../components/Panel'
import TextInput from '../components/TextInput'
import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { Version } from '../scripts/types/Version'
import ListItem from '../components/ListItem'
import List from '../components/List'
import { GetShards, Shard } from '../scripts/types/Shard'
import { SemVersion } from '../scripts/types/SemVersion'
// import { GetDefaultInstallPath } from '../scripts/VersionManager'

export default function ProfileEditor() {
  const [profileName, setProfileName] = useState('')
  const [profileActiveMods, setProfileActiveMods] = useState<Shard.Fragment[] | undefined>(undefined)
  const [profileRuntime, setProfileRuntime] = useState<Shard.Fragment | undefined>(undefined)
  const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<Version.Local>({ sem_version: "1.21.0.3", uuid: "21c7d413-83d5-45de-b8b2-e9e6f87fb5fe", format: 0})
  // const [profileInstallDir, setProfileInstallDir] = useState<string>(GetDefaultInstallPath())

  const { mods, runtimes, versions, profiles, SetProfiles, selected_profile, saveData, SetMods } = UseAppState()
  const navigate = useNavigate()

  if (profiles.length === 0) navigate('/profiles')

  const toggleModActive = (mod: Shard.Fragment) => {
    if (profileActiveMods) {
      if (profileActiveMods.map(shard => shard.uuid).includes(mod.uuid)) {
        const newActive = profileActiveMods.filter(m => m.uuid !== mod.uuid)
        setProfileActiveMods(newActive)
      } else {
        const newActive = [...profileActiveMods, mod]
        setProfileActiveMods(newActive)
      }
    }
  }

  const ModButton = ({ mod, mod_name }: { mod: Shard.Fragment, mod_name: string }) => {
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
          <p className="minecraft-seven text-white">{mod_name}</p>
        </div>
      </ListItem>
    )
  }

  const loadProfile = useCallback(() => {
    const profile = profiles[selected_profile]
    setProfileName(profile?.name ?? 'New Profile')
    setProfileRuntime(profile?.runtime)
    setProfileActiveMods(profile?.mods)
    setProfileMinecraftVersion(profile?.version)
  }, [profiles, selected_profile])

  const saveProfile = () => {
    profiles[selected_profile].name = profileName

    // Verify the vanilla runtime still exists
    if (profileRuntime) {
      if (!runtimes.map(runtime => runtime.meta.uuid).includes(profileRuntime.uuid)) setProfileRuntime(undefined)
    }

    // Ensure all mods still exist
    if (profileActiveMods) {
      const newMods = profileActiveMods.filter(mod => mods.map(mod => mod.meta.uuid).includes(mod.uuid))
      setProfileActiveMods(newMods)
    }



    profiles[selected_profile].runtime = profileRuntime
    profiles[selected_profile].mods = profileActiveMods
    profiles[selected_profile].version = profileMinecraftVersion

    saveData()
    navigate('/profiles')
  }

  const deleteProfile = () => {
    profiles.splice(selected_profile, 1)
    SetProfiles(profiles)

    saveData()
    navigate('/profiles')
  }

  useEffect(() => {
    const { mods } = GetShards()
    SetMods(mods)
  }, [SetMods])

  useEffect(() => {
    loadProfile()
  }, [loadProfile])

  return (
    <Panel>
      <div className="content_panel">
        {/* Settings */}
        <div className="flex flex-col gap-[8px]">
          <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
          <Dropdown
            labelText="Minecraft Version"
            default_index={versions.map(v => v.uuid).indexOf(profileMinecraftVersion.uuid)}
            setIndex={(index) => {
              setProfileMinecraftVersion({ uuid: versions[index].uuid, sem_version: SemVersion.toPrimitive(versions[index].sem_version), format: versions[index].format })
            }}
            // we don't support non-release versions right now so only show release lmao
            options={versions
              .filter(ver => ver.format === Version.Format.Release)
              .map(ver => Version.toString(ver))}
            id="minecraft-version"
          />
          <Dropdown
            labelText="Runtime"
            default_index={profileRuntime ? runtimes.map(r => r.meta.uuid).indexOf(profileRuntime.uuid) : undefined}
            setIndex={(index) => {
              setProfileRuntime(Shard.Full.toFragment(runtimes[index]))
            }}
            options={runtimes.map(r => r.meta.name)}
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
                {mods
                  .filter(mod => profileActiveMods?.map(m => m.uuid).includes(mod.meta.uuid))
                  .map((mod, index) => (
                    <ModButton mod={Shard.Full.toFragment(mod)} mod_name={mod.meta.name} key={index} />
                  ))}
              </List>
            </div>
            <div className=" w-[50%] h-full flex flex-col">
              <p className="text-white minecraft-seven text-[14px]">Inactive Mods</p>
              <List>
                {mods
                  .filter(mod => !profileActiveMods?.map(m => m.uuid).includes(mod.meta.uuid))
                  .map((mod, index) => (
                    <ModButton mod={Shard.Full.toFragment(mod)} mod_name={mod.meta.name} key={index} />
                  ))}
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
    </Panel>
  )
}
