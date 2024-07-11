import MainPanel from "../components/MainPanel";
// import MinecraftButton from "../components/MinecraftButton";
import { MinecraftVersion } from "../scripts/Versions";
import {GetInstalledVersions} from "../scripts/Versions";

const VersionButton = ({version}: { version: MinecraftVersion, index: number }) => {
    // const navigate = useNavigate();


    return (
        <div>
            <div className="cursor-pointer border-y-[3px] border-t-[#5a5b5c] border-b-[#333334] bg-[#48494a] p-[8px]">
                <p className="minecraft-seven text-white text-[14px] px-[4px]">{version.toString()}</p>
                <p className="minecraft-seven text-[#B1B2B5] text-[14px] px-[4px]">{"UUID:"} ({version.uuid})</p>
            </div>
        </div>
    )
}

export default function VersionPage() {
    // const navigate = useNavigate();


    const versions = GetInstalledVersions();


    return (
        <MainPanel>
            <div className="flex flex-col gap-[8px] h-full p-[8px] bg-[#48494A] border-[#1E1E1F] border-[3px] overflow-hidden">
                <p className="minecraft-seven text-white text-[14px]">Version Manager</p>
                <div className="flex flex-col border-[3px] border-[#1E1E1F] h-full bg-[#313233] overflow-y-auto scrollbar">

                    {
                        versions.map((version, index) => {
                            return <VersionButton version={version} index={index} key={index}/>
                        })
                    }
                </div>

                {/*<div className="bg-[#48494A] h-fit">*/}
                {/*    <MinecraftButton text="Create new profile" onClick={() => {*/}
                {/*        // const defaultProfile: Profile = {*/}
                {/*        //     name: "New Profile",*/}
                {/*        //     minecraft_version: "1.21.0.3",*/}
                {/*        //     mods: [],*/}
                {/*        //     runtime: "Vanilla"*/}
                {/*        // }*/}

                {/*        // const newProfiles = [...allProfiles, defaultProfile];*/}
                {/*        // setAllProfiles(newProfiles);*/}
                {/*        //*/}
                {/*        // setSelectedProfile(newProfiles.length - 1);*/}
                {/*        // navigate("/profile-editor");*/}
                {/*    }}/>*/}
                {/*</div>*/}

            </div>
        </MainPanel>
    )
}