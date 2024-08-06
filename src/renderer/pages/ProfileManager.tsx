import { useNavigate } from 'react-router-dom'
import { UseAppState } from '../contexts/AppState'
import MinecraftButton from '../components/MinecraftButton'
import Profile from '../scripts/types/Profile'
import { GetDefaultVersionPath, GetLatestVersion, Version } from '../scripts/types/Version'
import { useCallback } from 'react'

export default function ProfileManager() {
  const { profiles, SetProfiles, SetActiveProfile } = UseAppState()
  const navigate = useNavigate()

  const ProfileButton = useCallback(
    (profile: Profile, index: number) => {
      const OpenProfile = (index: number) => {
        SetActiveProfile(index)
        navigate('/profile-editor')
      }

      return (
        <div
          onClick={() => OpenProfile(index)}
          className="cursor-pointer border-[3px] border-[#1E1E1F] m-[-3px]"
          key={index}
        >
          <div className="flex flex-row gap-[8px] items-center p-[8px] inset_button">
            <div className="w-[30px] h-[30px] border-[3px] border-[#1E1E1F] box-content">
              <img
                src={profile?.icon_path ?? `images/icons/earth-icon.png`}
                className="w-full h-full pixelated"
                alt=""
              />
            </div>
            <div className="flex flex-col gap-[2px]">
              <p className="minecraft-seven text-white text-[14px]">{profile.name}</p>
              <p className="minecraft-seven text-[#B1B2B5] text-[14px]">
                {`${Version.toString(profile.version)} (${profile.runtime?.name ?? 'Vanilla'})`}
              </p>
            </div>
          </div>
        </div>
      )
    },
    [SetActiveProfile, navigate]
  )

  return (
    <>
      <div className="w-full h-full flex flex-col justify-between gap-[8px]">
        <div className="content_panel h-fit max-h-full overflow-y-auto overflow-x-hidden scrollbar">
          <div className="flex flex-col w-full">
            <div className="flex flex-row w-full align-bottom">
              <div className="border-[3px] border-[#1E1E1F] border-b-[0px] px-[8px] py-[4px] w-fit mr-[-3px]">
                <p className="minecraft-seven text-white text-[14px]">Profiles</p>
              </div>
              <div className="flex flex-col grow-[1] h-fit mt-auto">
                <div className="mt-auto bg-[#1E1E1F] h-[3px] " />
                <div
                  className="mt-auto border-x-[3px] box-content border-r-[#1E1E1F] border-l-[#48494a] h-[7px] grow-[1]" />
              </div>
            </div>

            <div className="flex flex-col w-full gap-[3px] border-[3px] border-[#1E1E1F] bg-[#313233]">
              {profiles.length > 0 ? (
                profiles.map((profile, index) => {
                  return ProfileButton(profile, index)
                })
              ) : (
                <div className="flex flex-col gap-[4px] flex-grow h-[58px] justify-center items-center">
                  <p className="minecraft-seven text-[14px] text-white">No profiles</p>
                  <p className="minecraft-seven text-[14px] text-[#B1B2B5]">
                    Create a new profile by clicking "Create New Profile" below
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
        <div className="content_panel h-fit">
          <div className="w-full h-fit">
            <MinecraftButton
              text="Create new profile"
              onClick={() => {
                const default_profile: Profile = {
                  name: 'New Profile',
                  version: { ...GetLatestVersion(), path: GetDefaultVersionPath() }
                }
                const newProfiles = [...profiles, default_profile]
                SetProfiles(newProfiles)
                SetActiveProfile(newProfiles.length - 1)
                navigate('/profile-editor')
              }}
            />
          </div>
        </div>
      </div>
    </>

    // <Panel>
    //   <div className="content_panel">
    //     <p className="minecraft-seven text-white text-[14px]">Profile Editor</p>
    //     <List>
    //       {GetProfiles().map((profile, index) => {
    //         return <ProfileButton profile={profile} index={index} key={index} />
    //       })}
    //     </List>
    //     <div className="bg-[#48494A] h-fit">
    //       <MinecraftButton
    //         text="Create new profile"
    //         onClick={() => {
    //           const default_profile: Profile = {
    //             name: 'New Profile',
    //             version: GetLatestVersion()
    //           }
    //           const newProfiles = [...profiles, default_profile]
    //           SetProfiles(newProfiles)
    //           SetSelectedProfile(newProfiles.length - 1)
    //           navigate('/profile-editor')
    //         }}
    //       />
    //     </div>
    //   </div>
    // </Panel>
  )
}
