import { useState } from "react";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import TextInput from "../components/TextInput";
import ModSection from "../components/ModSection";
import Dropdown from "../components/Dropdown";
import MinecraftButton from "../components/MinecraftButton";

export default function ProfileEditor() {
    const [ profileName, setProfileName ] = useState("Profile 1");
    const [ profileActiveMods, setProfileActiveMods ] = useState<string[]>([])
    const [ profileRuntime, setProfileRuntime ] = useState<string>("None");
    const [ allMods, setAllMods ] = useState(["AmethystRuntime@1.2.0"])

    const [ allRuntimes, setAllRuntimes ] = useState(["Vanilla", "AmethystRuntime@1.2.0"])

    const [ allMinecraftVersions, setAllMinecraftVersions ] = useState<string[]>(["1.20.51.1"]);
    const [ profileMinecraftVersion, setProfileMinecraftVersion ] = useState<string>("");

    return (
        <MainPanel>
            {/* Settings */}
            <DividedSection>
                <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                <Dropdown 
                    labelText="Minecraft Version" 
                    value={ profileMinecraftVersion }
                    setValue={ setProfileMinecraftVersion }
                    options={ allMinecraftVersions }
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
                    <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">e</div>
                </div>
                <div className=" w-[50%] h-full flex flex-col">
                    <p className="text-white minecraft-seven">Inactive Mods</p>
                    <div className="border-[2px] border-[#1E1E1F] bg-[#313233] flex-grow">e</div>
                </div>
            </DividedSection>

            {/* Profile Actions */}
            <DividedSection className="flex justify-around gap-[8px]">
                <div className="w-[50%]"><MinecraftButton text="Save Profile"/></div>
                <div className="w-[50%]"><MinecraftButton text="Delete Profile"/></div>
            </DividedSection>
        </MainPanel>
    )
}