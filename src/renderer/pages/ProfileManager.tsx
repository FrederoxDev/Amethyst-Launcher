import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { UseAppState } from '../contexts/AppState'
import MinecraftButton from '../components/MinecraftButton'
import Profile from '../scripts/types/Profile'
import List from '../components/List'
import ListItem from '../components/ListItem'
// import { GetLatestVersion } from '../scripts/types/Version'
import { GetProfiles } from '../scripts/types/Profile'

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
  const navigate = useNavigate()
  const { SetSelectedProfile } = UseAppState()

  const openProfile = (profile: Profile, index: number) => {
    SetSelectedProfile(index)
    navigate('/profile-editor')
  }

  return (
    <ListItem onClick={() => openProfile(profile, index)} className="cursor-pointer">
      <div className="p-[8px]">
        <p className="minecraft-seven text-white text-[14px] px-[4px]">{profile.name}</p>
        <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
          {profile.version.sem_version} ({profile.runtime?.name ?? 'Vanilla'})
        </p>
      </div>
    </ListItem>
  )
}

export default function ProfileManager() {
  // const navigate = useNavigate()
  // const { profiles, SetProfiles, SetSelectedProfile } = UseAppState()

  return (
    <Panel>
      <div className="content_panel">
        <p className="minecraft-seven text-white text-[14px]">Profile Editor</p>
        <List>
          {GetProfiles().map((profile, index) => {
            return <ProfileButton profile={profile} index={index} key={index} />
          })}
        </List>
        <div className="bg-[#48494A] h-fit">
          <MinecraftButton
            text="Create new profile"
            onClick={() => {
              // const default_profile: Profile = {
              //   name: 'New Profile',
              //   version: GetLatestVersion()
              // }
              // const newProfiles = [...profiles, default_profile]
              // SetProfiles(newProfiles)
              // SetSelectedProfile(newProfiles.length - 1)
              // navigate('/profile-editor')
            }}
          />
        </div>
      </div>
    </Panel>
  )
}
