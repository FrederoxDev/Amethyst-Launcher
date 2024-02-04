import { useEffect, useState } from "react";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import TextInput from "../components/TextInput";
import Dropdown from "../components/Dropdown";
import MinecraftButton, { MinecraftButtonStyle } from "../components/MinecraftButton";
import { useAppState } from "../contexts/AppState";
import { useNavigate } from "react-router-dom";
import { VersionType } from "../types/MinecraftVersion";

export default function ProfileEditor() {
    const [ profileName, setProfileName ] = useState("");
    const [ profileActiveMods, setProfileActiveMods ] = useState<string[]>([])
    const [ profileRuntime, setProfileRuntime ] = useState<string>("");
    const [ profileMinecraftVersion, setProfileMinecraftVersion ] = useState<string>("");

    const { allMods, allRuntimes, allMinecraftVersions, allProfiles, setAllProfiles, selectedProfile, saveData } = useAppState()
    const navigate = useNavigate();

    if (allProfiles.length == 0) navigate("/profiles");

    const toggleModActive = (name: string) => {
        if (profileActiveMods.includes(name)) {
            const newActive = profileActiveMods.filter(m => m != name);
            setProfileActiveMods(newActive);
        }
        else {
            const newActive = [...profileActiveMods, name];
            setProfileActiveMods(newActive)
        }
    }

    const ModButton = ({ name }: { name: string }) => {
        const [ isHovered, setIsHovered ] = useState(false);

        return (
            <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} 
                onClick={() => toggleModActive(name)}  
            >
                <DividedSection className="cursor-pointer" style={{ backgroundColor: isHovered ? "#5A5B5C" : "#48494A", padding: "1px", paddingLeft: "4px", paddingRight: "4px" }}>
                    <p className="minecraft-seven text-white">{ name }</p>
                </DividedSection>
            </div>
        )
    }

    const loadProfile = () => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileActiveMods(profile?.mods ?? []);
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.20.51.1");
    }

    const saveProfile = () => {
        allProfiles[selectedProfile].name = profileName;
        allProfiles[selectedProfile].runtime = profileRuntime;
        allProfiles[selectedProfile].mods = profileActiveMods;
        allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion;
        
        saveData();
        navigate("/profiles");
    }

    const deleteProfile = () => {
        const newProfiles = allProfiles;
        newProfiles.splice(selectedProfile, 1);
        setAllProfiles(allProfiles);
        
        saveData();
        navigate("/profiles");
    }

    useEffect(() => {
        loadProfile()
    }, []);

    return (
        <MainPanel>
            {/* Settings */}
            <DividedSection>
                <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                <Dropdown 
                    labelText="Minecraft Version" 
                    value={ profileMinecraftVersion }
                    setValue={ setProfileMinecraftVersion }
                    
                    // we don't support non-release versions right now so only show release lmao 
                    options={ allMinecraftVersions.filter(ver => ver.versionType == VersionType.Release).map(ver => ver.toString()) }
                    id="minecraft-version"
                />
                <Dropdown 
                    labelText="Runtime" 
                    value={ profileRuntime }
                    setValue={ setProfileRuntime }
                    options={ allRuntimes }
                    id="runtime-mod"
                />
            </DividedSection>

            {/* Mod Selection */}
            <DividedSection className="flex-grow flex justify-around gap-[8px]">
                <div className=" w-[50%] h-full flex flex-col">
                    <p className="text-white minecraft-seven">Active Mods</p>
                    <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">
                        {
                            allMods.length > 0 ? allMods.filter(mod => profileActiveMods.includes(mod))
                                .map((mod, index) => <ModButton name={mod} key={index} />) : <></>
                        }
                    </div>
                </div>
                <div className=" w-[50%] h-full flex flex-col">
                    <p className="text-white minecraft-seven">Inactive Mods</p>
                    <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">
                    {
                            allMods.length > 0 ? allMods.filter(mod => !profileActiveMods.includes(mod))
                                .map((mod, index) => <ModButton name={mod} key={index} />) : <></>
                        }
                    </div>
                </div>
            </DividedSection>

            {/* Profile Actions */}
            <DividedSection className="flex justify-around gap-[8px]">
                <div className="w-[50%]"><MinecraftButton text="Save Profile" onClick={() => saveProfile()} /></div>
                <div className="w-[50%]"><MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn} onClick={() => deleteProfile()}/></div>
            </DividedSection>
        </MainPanel>
    )
}