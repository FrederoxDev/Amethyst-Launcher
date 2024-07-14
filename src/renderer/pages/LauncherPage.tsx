import Dropdown from '../components/Dropdown'
import MinecraftButton from '../components/MinecraftButton'
import { UseAppState } from '../contexts/AppState'

import { LaunchGame } from '../scripts/Game'

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
    setError
  } = UseAppState()

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
    <div className="relative w-full h-full">
      {error === '' ? (
        <></>
      ) : (
        <>
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
        </>
      )}

      <div className="absolute bottom-0 w-full">
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
        <div className="flex gap-[8px] border-[#1E1E1F] border-[3px] p-[8px] bg-[#48494A]">
          <div className="w-[30%] translate-y-[5px]">
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
    </div>
  )
}
