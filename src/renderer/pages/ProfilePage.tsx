import { useNavigate } from 'react-router-dom'
import Panel from '../components/Panel'
import { UseAppState } from '../contexts/AppState'
import MinecraftButton from '../components/MinecraftButton'
import { Profile } from '../scripts/types/Profile'
import List from '../components/List'
import ListItem from '../components/ListItem'
import { GetShards } from '../scripts/types/Shard'
import { FindCachedVersion, GetDefaultVersionPath } from '../scripts/types/Version'
import { SemVersion } from '../scripts/types/SemVersion'

const ProfileButton = ({ profile, index }: { profile: Profile; index: number }) => {
  const navigate = useNavigate()
  const { SetSelectedProfile } = UseAppState()

  const openProfile = (profile: Profile, index: number) => {
    SetSelectedProfile(index)
    navigate('/profile-editor')
  }

  const runtime = GetShards().runtimes.find(shard => shard.meta.uuid === profile.runtime?.uuid)?.meta.name

  return (
    <ListItem onClick={() => openProfile(profile, index)} className="cursor-pointer">
      <div className="p-[8px]">
        <p className="minecraft-seven text-white text-[14px] px-[4px]">{profile.name}</p>
        <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">
          {profile.version.sem_version} ({runtime ?? 'Vanilla'})
        </p>
      </div>
    </ListItem>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { profiles, SetProfiles, SetSelectedProfile } = UseAppState()

  const default_version = FindCachedVersion(SemVersion.fromPrimitive('1.21.0.3'))

  if (!default_version) {
    throw new Error('Could not find default version!')
  }

  return (
    <Panel>
      <div className="content_panel">
        <p className="minecraft-seven text-white text-[14px]">Profile Editor</p>
        <List>
          {profiles.map((profile, index) => {
            return <ProfileButton profile={profile} index={index} key={index} />
          })}
        </List>
        <div className="bg-[#48494A] h-fit">
          <MinecraftButton
            text="Create new profile"
            onClick={() => {
              const defaultProfile: Profile = {
                name: 'New Profile',
                version: { sem_version: SemVersion.toPrimitive(default_version.sem_version), format: default_version.format, uuid: default_version.uuid }
              }

              const newProfiles = [...profiles, defaultProfile]
              SetProfiles(newProfiles)

              SetSelectedProfile(newProfiles.length - 1)
              navigate('/profile-editor')
            }}
          />
        </div>
      </div>
    </Panel>
  )
}
