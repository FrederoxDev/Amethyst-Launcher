import { useCallback, useEffect, useState } from 'react'
import Panel from '../components/Panel'
import TextInput from '../components/TextInput'
import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { GetMods } from '../scripts/Mods'
import { MinecraftVersionType } from '../scripts/Versions'
import ListItem from '../components/ListItem'
import List from '../components/List'
// import { GetDefaultInstallPath } from '../scripts/VersionManager'

export default function ProfileEditor() {
  const [profileName, setProfileName] = useState('')
  const [profileActiveMods, setProfileActiveMods] = useState<string[]>([])
  const [profileRuntime, setProfileRuntime] = useState<string>('')
  const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>('')
  // const [profileInstallDir, setProfileInstallDir] = useState<string>(GetDefaultInstallPath())

  const {
    allMods,
    allRuntimes,
    allMinecraftVersions,
    allProfiles,
    setAllProfiles,
    selectedProfile,
    saveData,
    setAllMods
  } = UseAppState()
  const navigate = useNavigate()

  if (allProfiles.length === 0) navigate('/profiles')

  const toggleModActive = (name: string) => {
    if (profileActiveMods.includes(name)) {
      const newActive = profileActiveMods.filter(m => m !== name)
      setProfileActiveMods(newActive)
    } else {
      const newActive = [...profileActiveMods, name]
      setProfileActiveMods(newActive)
    }
  }

  const ModButton = ({ name }: { name: string }) => {
    return (
      <ListItem
        className="cursor-pointer"
        onClick={() => {
          if (profileRuntime === 'Vanilla') {
            alert('Cannot add mods to a vanilla profile')
            return
          }

          toggleModActive(name)
        }}
      >
        <div className="p-[4px]">
          <p className="minecraft-seven text-white">{name}</p>
        </div>
      </ListItem>
    )
  }

  const loadProfile = useCallback(() => {
    const profile = allProfiles[selectedProfile]
    setProfileName(profile?.name ?? 'New Profile')
    setProfileRuntime(profile?.runtime ?? 'Vanilla')
    setProfileActiveMods(profile?.mods ?? [])
    setProfileMinecraftVersion(profile?.minecraft_version ?? '1.21.0.3')
  }, [allProfiles, selectedProfile])

  const saveProfile = () => {
    allProfiles[selectedProfile].name = profileName

    // Verify the vanilla runtime still exists
    if (!(profileRuntime in allRuntimes)) setProfileRuntime('Vanilla')

    // Ensure all mods still exist
    const newMods = profileActiveMods.filter(mod => allMods.includes(mod))
    setAllMods(newMods)

    allProfiles[selectedProfile].runtime = profileRuntime
    allProfiles[selectedProfile].mods = profileActiveMods
    allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion

    saveData()
    navigate('/profiles')
  }

  const deleteProfile = () => {
    allProfiles.splice(selectedProfile, 1)
    setAllProfiles(allProfiles)

    saveData()
    navigate('/profiles')
  }

  useEffect(() => {
    const { mods } = GetMods()
    setAllMods(mods)
  }, [setAllMods])

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
            value={profileMinecraftVersion}
            setValue={setProfileMinecraftVersion}
            // we don't support non-release versions right now so only show release lmao
            options={allMinecraftVersions
              .filter(ver => ver.versionType === MinecraftVersionType.Release)
              .map(ver => ver.toString())}
            id="minecraft-version"
          />
          <Dropdown
            labelText="Runtime"
            value={profileRuntime}
            setValue={setProfileRuntime}
            options={allRuntimes}
            id="runtime-mod"
          />
          {/*<TextInput label="Install Directory" text={profileInstallDir} setText={setProfileInstallDir} />*/}
        </div>

        {/* Mod Selection */}
        {profileRuntime === 'Vanilla' ? (
          <div className="flex-grow flex justify-around">
            <div className="h-full flex flex-col"></div>
          </div>
        ) : (
          <div className="bg-[#48494a] flex-grow flex justify-around gap-[8px]">
            <div className="w-[50%] h-full flex flex-col">
              <p className="text-white minecraft-seven text-[14px]">Active Mods</p>
              <List>
                {allMods
                  .filter(mod => profileActiveMods.includes(mod))
                  .map((mod, index) => (
                    <ModButton name={mod} key={index} />
                  ))}
              </List>
            </div>
            <div className=" w-[50%] h-full flex flex-col">
              <p className="text-white minecraft-seven text-[14px]">Inactive Mods</p>
              <List>
                {allMods
                  .filter(mod => !profileActiveMods.includes(mod))
                  .map((mod, index) => (
                    <ModButton name={mod} key={index} />
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
