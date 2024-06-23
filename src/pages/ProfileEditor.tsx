import MinecraftButton, { MinecraftButtonStyle } from "../components/MinecraftButton";
import { getVersionsFolder } from "../versionSwitcher/AmethystPaths";
import DividedSection from "../components/DividedSection";
import { VersionType } from "../types/MinecraftVersion";
import FolderInput from "../components/FolderInput";
import { useAppState } from "../contexts/AppState";
import { findAllMods } from "../launcher/Modlist";
import MainPanel from "../components/MainPanel";
import TextInput from "../components/TextInput";
import { useNavigate } from "react-router-dom";
import Dropdown from "../components/Dropdown";
import { useEffect, useState } from "react";

const fs = window.require('fs') as typeof import('fs');

export default function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileActiveMods, setProfileActiveMods] = useState<string[]>([])
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");
    const [ gamePath, setGamePath ] = useState("");

    const {
        allMods,
        allRuntimes,
        allMinecraftVersions,
        allProfiles,
        setAllProfiles,
        selectedProfile,
        saveData,
        setAllMods,
        error,
        setError
    } = useAppState();
    const navigate = useNavigate();

    if (allProfiles.length === 0) navigate("/profiles");

    const toggleModActive = (name: string) => {
        if (profileActiveMods.includes(name)) {
            const newActive = profileActiveMods.filter(m => m !== name);
            setProfileActiveMods(newActive);
        } else {
            const newActive = [...profileActiveMods, name];
            setProfileActiveMods(newActive);
        }
    }

    const ModButton = ({name}: { name: string }) => {
        const [isHovered, setIsHovered] = useState(false);

        return (
            <div onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)} 
                onClick={() => {
                    if (profileRuntime === "Vanilla") {
                        return alert("Cannot add mods to a vanilla profile");
                    }

                    toggleModActive(name);
                }}  
            >
                <DividedSection className="cursor-pointer" style={{
                    backgroundColor: isHovered ? "#5A5B5C" : "#48494A",
                    padding: "1px",
                    paddingLeft: "4px",
                    paddingRight: "4px"
                }}>
                    <p className="minecraft-seven text-white">{name}</p>
                </DividedSection>
            </div>
        )
    }

    const loadProfile = () => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileActiveMods(profile?.mods ?? []);
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.21.0.3");
        setGamePath(profile?.path ?? getVersionsFolder());
    }

    const saveProfile = () => {
        const regex = /^(?:[a-zA-Z]\:)?(?:[\\\/][^<>:"\/\\|?*\x00-\x1F]+)+[\\\/]?$/;
        if(!regex.test(gamePath))
            return setError("The given install directory is not valid!");

        allProfiles[selectedProfile].name = profileName;

        // Verify the vanilla runtime still exists
        if (!(profileRuntime in allRuntimes)) setProfileRuntime("Vanilla");

        // Ensure all mods still exist
        const newMods = profileActiveMods.filter(mod => allMods.includes(mod));
        setAllMods(newMods);

        allProfiles[selectedProfile].runtime = profileRuntime;
        allProfiles[selectedProfile].mods = profileActiveMods;
        allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion;
        allProfiles[selectedProfile].path = gamePath;
        
        saveData();
        setError("");
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
        loadProfile();
    }, []);

    const fetchMods = () => {
        const { mods } = findAllMods();
        setAllMods(mods);
    };

    useEffect(() => {
        const intervalId = setInterval(fetchMods, 500); // Fetch every 5 seconds

        return () => clearInterval(intervalId); // Cleanup interval on component unmount
    }, [setAllMods]);

    return (
        <MainPanel>
            { error === "" ? <></> : (
                <>
                    <div className="bg-red-500 w-full">
                        <p className="minecraft-seven text-[13px]">{error}</p>
                    </div>
                    <div className="bg-red-600 h-[2px] w-full min-h-[2px]"></div>
                </>
            )
            }
            {/* Settings */}
            <DividedSection>
                <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                <Dropdown 
                    labelText="Minecraft Version" 
                    value={ profileMinecraftVersion }
                    setValue={ setProfileMinecraftVersion }
                    
                    // we don't support non-release versions right now so only show release lmao 
                    options={ allMinecraftVersions.filter(ver => ver.versionType === VersionType.Release).map(ver => ver.toString()) }
                    id="minecraft-version"
                />
                <Dropdown
                    labelText="Runtime"
                    value={profileRuntime}
                    setValue={setProfileRuntime}
                    options={allRuntimes}
                    id="runtime-mod"
                />
                <FolderInput label="Custom Directory" text={gamePath ?? ""} setPath={setGamePath} />
            </DividedSection>

            {/* Mod Selection */}
            {
                profileRuntime === "Vanilla"
                    ? <DividedSection className="flex-grow flex justify-around gap-[8px]">
                        <div className="h-full flex flex-col"></div>
                    </DividedSection>
                    : <DividedSection className="flex-grow flex justify-around gap-[8px]">
                        <div className=" w-[50%] h-full flex flex-col">
                            <p className="text-white minecraft-seven">Active Mods</p>
                            <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">
                                {
                                    allMods.length > 0 ? allMods.filter(mod => profileActiveMods.includes(mod))
                                        .map((mod, index) => <ModButton name={mod} key={index}/>) : <></>
                                }
                            </div>
                        </div>
                        <div className=" w-[50%] h-full flex flex-col">
                            <p className="text-white minecraft-seven">Inactive Mods</p>
                            <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">
                                {
                                    allMods.length > 0 ? allMods.filter(mod => !profileActiveMods.includes(mod))
                                        .map((mod, index) => <ModButton name={mod} key={index}/>) : <></>
                                }
                            </div>
                        </div>
                    </DividedSection>
            }

            {/* Profile Actions */}
            <DividedSection className="flex justify-around gap-[8px]">
                <div className="w-[50%]"><MinecraftButton text="Save Profile" onClick={() => saveProfile()}/></div>
                <div className="w-[50%]"><MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn}
                                                          onClick={() => deleteProfile()}/></div>
            </DividedSection>
        </MainPanel>
    )
}