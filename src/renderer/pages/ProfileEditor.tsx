import {useCallback, useEffect, useState} from "react";
import MainPanel from "../components/MainPanel";
import TextInput from "../components/TextInput";
import Dropdown from "../components/Dropdown";
import MinecraftButton, {MinecraftButtonStyle} from "../components/MinecraftButton";
import {useAppState} from "../contexts/AppState";
import {useNavigate} from "react-router-dom";
import {getModList} from "../scripts/Mods";
import {MinecraftVersionType} from "../scripts/Versions";

export default function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileActiveMods, setProfileActiveMods] = useState<string[]>([])
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");

    const {
        allMods,
        allRuntimes,
        allMinecraftVersions,
        allProfiles,
        setAllProfiles,
        selectedProfile,
        saveData,
        setAllMods
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
                         alert("Cannot add mods to a vanilla profile");
                         return;
                     }

                     toggleModActive(name);
                 }}
            >
                <div className="cursor-pointer border-y-[2px] border-solid border-t-[#5A5B5C] border-b-[#1E1E1F] p-[8px] bg-[#48494A]" style={{
                    backgroundColor: isHovered ? "#5A5B5C" : "#48494A",
                    padding: "1px",
                    paddingLeft: "4px",
                    paddingRight: "4px"
                }}>
                    <p className="minecraft-seven text-white">{name}</p>
                </div>
            </div>
        )
    }

    const loadProfile = useCallback(() => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileActiveMods(profile?.mods ?? []);
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.21.0.3");
    }, [allProfiles, selectedProfile])

    const saveProfile = () => {
        allProfiles[selectedProfile].name = profileName;

        // Verify the vanilla runtime still exists
        if (!(profileRuntime in allRuntimes)) setProfileRuntime("Vanilla");

        // Ensure all mods still exist
        const newMods = profileActiveMods.filter(mod => allMods.includes(mod));
        setAllMods(newMods);

        allProfiles[selectedProfile].runtime = profileRuntime;
        allProfiles[selectedProfile].mods = profileActiveMods;
        allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion;

        saveData();
        navigate("/profiles");
    }

    const deleteProfile = () => {
        allProfiles.splice(selectedProfile, 1);
        setAllProfiles(allProfiles);

        saveData();
        navigate("/profiles");
    }

    const fetchMods = useCallback(() => {
        const {mods} = getModList();
        setAllMods(mods);
    }, [setAllMods])

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    useEffect(() => {
        const intervalId = setInterval(fetchMods, 500); // Fetch every 5 seconds

        return () => clearInterval(intervalId); // Cleanup interval on component unmount
    }, [setAllMods, fetchMods]);

    return (
        <MainPanel>
            <div className="relative w-full h-full flex flex-col gap-[8px] border-[3px] border-[#1E1E1F] p-[8px] bg-[#48494A]">
                {/* Settings */}
                <div>
                    <TextInput label="Profile Name" text={profileName} setText={setProfileName}/>
                    <Dropdown
                        labelText="Minecraft Version"
                        value={profileMinecraftVersion}
                        setValue={setProfileMinecraftVersion}

                        // we don't support non-release versions right now so only show release lmao
                        options={allMinecraftVersions.filter(ver => ver.versionType === MinecraftVersionType.Release).map(ver => ver.toString())}
                        id="minecraft-version"
                    />
                    <Dropdown
                        labelText="Runtime"
                        value={profileRuntime}
                        setValue={setProfileRuntime}
                        options={allRuntimes}
                        id="runtime-mod"
                    />
                </div>

                {/* Mod Selection */}
                {
                    profileRuntime === "Vanilla"
                        ? 
                        
                        <div className="flex-grow flex justify-around">
                            <div className="h-full flex flex-col"></div>
                        </div>

                        : 
                        
                        <div className="flex-grow flex justify-around gap-[8px]">
                            <div className=" w-[50%] h-full flex flex-col">
                                <p className="text-white minecraft-seven text-[14px]">Active Mods</p>
                                <div className="border-[3px] border-[#1E1E1F] bg-[#313233] flex-grow">
                                    {
                                        allMods.length > 0 ? allMods.filter(mod => profileActiveMods.includes(mod))
                                            .map((mod, index) => <ModButton name={mod} key={index}/>) : <></>
                                    }
                                </div>
                            </div>
                            <div className=" w-[50%] h-full flex flex-col">
                                <p className="text-white minecraft-seven text-[14px]">Inactive Mods</p>
                                <div className="border-[3px] border-[#1E1E1F] bg-[#313233] flex-grow">
                                    {
                                        allMods.length > 0 ? allMods.filter(mod => !profileActiveMods.includes(mod))
                                            .map((mod, index) => <ModButton name={mod} key={index}/>) : <></>
                                    }
                                </div>
                            </div>
                        </div>
                }

                {/* Profile Actions */}
                <div className="flex justify-around gap-[8px]">
                    <div className="w-[50%]"><MinecraftButton text="Save Profile" onClick={() => saveProfile()}/></div>
                    <div className="w-[50%]"><MinecraftButton text="Delete Profile" style={MinecraftButtonStyle.Warn} onClick={() => deleteProfile()}/></div>
                </div>
            </div>
        </MainPanel>
    )
}