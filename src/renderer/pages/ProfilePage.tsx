import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { UseAppState } from '../contexts/AppState'
import MinecraftButton from '../components/MinecraftButton'
import { Profile } from '../scripts/Profiles'
import List from '../components/List'
import ListItem from '../components/ListItem'

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
  const navigate = useNavigate()
  const { setSelectedProfile } = UseAppState()

  const openProfile = (profile: Profile, index: number) => {
    setSelectedProfile(index)
    navigate('/profile-editor')
  }

  return (
    <ListItem onClick={() => openProfile(profile, index)} className="cursor-pointer">
      <div className="p-[8px]">
        <p className="minecraft-seven text-white text-[14px] px-[4px]">{profile.name}</p>
        <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
          {profile.minecraft_version} ({profile.runtime})
        </p>
      </div>
    </ListItem>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { allProfiles, setAllProfiles, setSelectedProfile } = UseAppState()

  return (
    <Panel>
      <div className="content_panel">
        <p className="minecraft-seven text-white text-[14px]">Profile Editor</p>
        <List>
          {allProfiles.map((profile, index) => {
            return <ProfileButton profile={profile} index={index} key={index} />
          })}
        </List>
        <div className="bg-[#48494A] h-fit">
          <MinecraftButton
            text="Create new profile"
            onClick={() => {
              const defaultProfile: Profile = {
                name: 'New Profile',
                minecraft_version: '1.21.0.3',
                mods: [],
                runtime: 'Vanilla'
              }

              const newProfiles = [...allProfiles, defaultProfile]
              setAllProfiles(newProfiles)

              setSelectedProfile(newProfiles.length - 1)
              navigate('/profile-editor')
            }}
          />
        </div>
      </div>
    </Panel>
  )
}
