import { useCallback, useEffect, useState } from 'react'
import { MainPanel } from '../components/MainPanel'
import {TextInput} from '../components/TextInput'
import {Dropdown} from '../components/Dropdown'
import {MinecraftButton} from '../components/MinecraftButton'
import { MinecraftButtonStyle } from '../components/MinecraftButtonStyle'
import { UseAppState } from '../contexts/AppState'
import { useNavigate } from 'react-router-dom'
import { MinecraftVersion, MinecraftVersionType } from '../scripts/Versions'
import { SemVersion } from '../scripts/classes/SemVersion'

export function ProfileEditor() {
  const [profileName, setProfileName] = useState('')
  const [profileActiveMods, setProfileActiveMods] = useState<string[]>([])
  const [profileRuntime, setProfileRuntime] = useState<string>('')
  const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>('')

  const {
    allValidMods,
    allRuntimes,
    allMinecraftVersions,
    allProfiles,
    setAllProfiles,
    selectedProfile,
    saveData,
    setAllValidMods,
    allInvalidMods
  } = UseAppState()
  const navigate = useNavigate()

  useEffect(() => {
    if (allProfiles.length === 0) {
      navigate('/profiles')
    }
  }, [allProfiles, navigate])

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
      <div
        className="m-[-3px] border-[3px] border-[#1E1E1F]"
        onClick={() => {
          if (profileRuntime === 'Vanilla') {
            alert('Cannot add mods to a vanilla profile')
            return
          }

          toggleModActive(name)
        }}
      >
        <div className="cursor-pointer border-[3px] border-t-[#5a5b5c] border-l-[#5a5b5c] border-b-[#333334] border-r-[#333334] bg-[#48494a] p-[4px]">
          <p className="minecraft-seven text-white">{name}</p>
        </div>
      </div>
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
    const newMods = profileActiveMods.filter(mod => allValidMods.includes(mod))
    setAllValidMods(newMods)

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

  // useEffect(() => {
  //   const mods = GetAllMods().filter(m => m.ok).map(m => m.id)
  //   setAllValidMods(mods)
  // }, [setAllValidMods])

  useEffect(() => {
    loadProfile();
    saveData();
  }, [loadProfile])

  const filterVersion = (version: MinecraftVersion): boolean => {
    // Currently only support stable UWP versions
    return version.versionType === MinecraftVersionType.UwpStable;
  }

  const formatVersionName = (version: MinecraftVersion): string => {
    return SemVersion.toString(version.version);
  }

  return (
    <MainPanel>
      <div className="w-full h-full flex flex-col p-[8px] gap-[8px] border-[3px] border-[#1E1E1F] bg-[#48494A]">
        {/* Settings */}
        <div className="flex flex-col gap-[8px]">
          <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
          <Dropdown
            labelText="Minecraft Version"
            value={profileMinecraftVersion}
            setValue={setProfileMinecraftVersion}
            options={allMinecraftVersions.filter(filterVersion).map(formatVersionName)}
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
        
        { allInvalidMods.length > 0 && (
          <p className='text-red-400 minecraft-seven text-[16px]'>Failed to show {allInvalidMods.length} mods! See Mod Manager for details</p>
        )}

        {/* Mod Selection */}
        {profileRuntime === 'Vanilla' ? (
          <div className="flex-grow flex justify-around">
            <div className="h-full flex flex-col"></div>
          </div>
        ) : (
          <div className="bg-[#48494a] flex-grow flex justify-around gap-[8px]">
            <div className="w-[50%] h-full flex flex-col">
              <p className="text-white minecraft-seven text-[14px]">Active Mods</p>
              <div className="border-[3px] border-[#1E1E1F] bg-[#313233] flex-grow">
                {allValidMods.length > 0 ? (
                  allValidMods
                    .filter(mod => profileActiveMods.includes(mod))
                    .map((mod, index) => <ModButton name={mod} key={index} />)
                ) : (
                  <></>
                )}
              </div>
            </div>
            <div className=" w-[50%] h-full flex flex-col">
              <p className="text-white minecraft-seven text-[14px]">Inactive Mods</p>
              <div className="border-[3px] border-[#1E1E1F] bg-[#313233] flex-grow">
                {allValidMods.length > 0 ? (
                  allValidMods
                    .filter(mod => !profileActiveMods.includes(mod))
                    .map((mod, index) => <ModButton name={mod} key={index} />)
                ) : (
                  <></>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Profile Actions */}
        <div className="flex justify-around gap-[8px]">
          <MinecraftButton text="Save Profile" onClick={() => saveProfile()} />
          <MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn} onClick={() => deleteProfile()} />
        </div>
      </div>
    </MainPanel>
  )
}
