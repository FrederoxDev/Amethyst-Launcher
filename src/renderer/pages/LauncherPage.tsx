import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { UseAppState } from '../contexts/AppState'
import { SemVersion } from '../scripts/classes/SemVersion'
import { IsDevModeEnabled, TryEnableDevMode } from '../scripts/DeveloperMode'
import {
  CleanupInstall,
  CreateLock,
  DownloadVersion,
  ExtractVersion,
  InstallProxy,
  IsDownloaded,
  IsLocked,
  IsRegistered
} from '../scripts/VersionManager'
import { RegisterVersion, UnregisterCurrent } from '../scripts/AppRegistry'
import { GetLauncherConfig, SetLauncherConfig } from '../scripts/Launcher'
import child from 'child_process'
import Panel from '../components/Panel'

export default function LauncherPage() {
  const {
    allProfiles,
    selectedProfile,
    setSelectedProfile,
    loadingPercent,
    status,
    setStatus,
    isLoading,
    setIsLoading,
    error,
    setError,
    allMinecraftVersions,
    setLoadingPercent
  } = UseAppState()

  const LaunchGame = async () => {
    const log = (msg: string) => {
      console.log(msg)
      setStatus(msg)
    }

    if (isLoading) return

    if (allProfiles.length === 0) {
      throw new Error('Cannot launch without a profile!')
    }

    const profile = allProfiles[selectedProfile]
    const semVersion = SemVersion.fromString(profile.minecraft_version)
    const minecraftVersion = allMinecraftVersions.find(version => version.version.toString() === semVersion.toString())!

    if (minecraftVersion === undefined) {
      throw new Error(`Failed to find minecraft version ${semVersion.toString()} in the profile in allVersions!`)
    }

    setError('')
    setIsLoading(true)

    // Check that the user has developer mode enabled on windows for the game to be installed through loose files.
    if (!IsDevModeEnabled()) {
      const enabled_dev = await TryEnableDevMode()
      if (!enabled_dev) {
        throw new Error(
          "Failed to enable 'Developer Mode' in windows settings to allow installing the game from loose files, please enable manually or make sure to press 'Yes' to enable automatically."
        )
      }
    }

    // We create a lock file when starting the download
    // if we are doing a launch, and we detect it for the version we are targeting
    // there is a good chance the previous install/download failed and therefore remove it.
    const didPreviousDownloadFail = IsLocked(semVersion)

    if (didPreviousDownloadFail) {
      log('Detected a .lock file from the previous download attempt, cleaning up.')
      CleanupInstall(semVersion, false)
      log('Removed previous download attempt.')
    }

    // Check for the folder for the version we are targeting, if not present we need to fetch.
    if (!IsDownloaded(semVersion)) {
      log('Target version is not downloaded.')
      CreateLock(semVersion)
      await DownloadVersion(minecraftVersion, setStatus, setLoadingPercent)
      await ExtractVersion(minecraftVersion, setStatus, setLoadingPercent)
      log('Cleaning up after successful download')
      CleanupInstall(semVersion, true)
    }

    // Only register the game if needed
    if (!IsRegistered(minecraftVersion)) {
      setStatus('Unregistering existing version')
      await UnregisterCurrent()

      setStatus('Registering downloaded version')
      await RegisterVersion(minecraftVersion)

      SetLauncherConfig(GetLauncherConfig())
    }

    setIsLoading(false)
    setStatus('')

    InstallProxy(minecraftVersion)

    const startGameCmd = `start minecraft:`
    child.exec(startGameCmd)
  }

  const launchGame = async () => {
    try {
      await LaunchGame()
    } catch (e) {
      console.error(e)
      setError((e as Error).message)
      setStatus('')
      setIsLoading(false)
    }
  }

  return (
    <Panel>
      {error !== '' && (
        <div className="flex flex-row gap-[8px] bg-[#CA3636] w-full border-[#CF4A4A] border-[3px] justify-between items-center">
          <div className="flex flex-row p-[8px] gap-[8px]">
            <img src="images/icons/warning-icon.png" className="w-[24px] h-[24px] pixelated" alt="" />
            <p className="minecraft-seven text-[#FFFFFF] text-[16px]">{error}</p>
          </div>
          <div className="shrink-0 flex flex-row p-[8px] gap-[8px] justify-right items-center">
            <div className="cursor-pointer p-[4px]" onClick={() => setError('')}>
              <svg width="18" height="18" viewBox="0 0 12 12">
                <polygon
                  className="fill-[#FFFFFF]"
                  fillRule="evenodd"
                  points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                />
              </svg>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col justify-end h-full w-full">
        {/* Not affiliated disclaimer */}
        <div className="bg-[#0c0c0cc5] w-fit ml-auto rounded-t-[3px]">
          <p className="minecraft-seven text-white px-[4px] text-[13px]">
            Not approved by or associated with Mojang or Microsoft
          </p>
        </div>

        {/* Loading bar */}
        <div
          className={`bg-[#313233] ${status || isLoading ? 'h-[25px]' : 'h-0'} transition-all duration-300 ease-in-out`}
        >
          <div
            className={`bg-[#3C8527] absolute ${isLoading ? 'min-h-[25px]' : 'min-h-0'} transition-all duration-300 ease-in-out`}
            style={{ width: `${loadingPercent * 100}%` }}
          ></div>
          <p className="minecraft-seven absolute z-30 text-white overflow-hidden text-ellipsis whitespace-nowrap max-w-full px-2">
            {status}
          </p>
        </div>

        {/* Profile Selector & Play Button */}
        <div className="flex flex-row gap-[8px] border-[#1E1E1F] border-[3px] p-[8px] bg-[#48494A]">
          <div className="w-[30%] mt-auto">
            <Dropdown
              labelText="Profile"
              options={allProfiles?.map(profile => profile.name)}
              value={allProfiles[selectedProfile]?.name}
              setValue={value => {
                setSelectedProfile(allProfiles.map(profile => profile.name).findIndex(e => e === value))
              }}
              id="profile-select"
            />
          </div>

          <div className="w-[70%]">
            <MinecraftButton text="Launch Game" onClick={launchGame} />
          </div>
        </div>
      </div>
    </Panel>
  )
}
