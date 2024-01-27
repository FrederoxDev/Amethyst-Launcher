import { useState } from "react";
import DividedSection from "../components/DividedSection";
import MainPanel from "../components/MainPanel";
import TextInput from "../components/TextInput";
import ModSection from "../components/ModSection";
import Dropdown from "../components/Dropdown";

export default function ProfileEditor() {
    const [ profileName, setProfileName ] = useState("Profile 1");
    const [ profileActiveMods, setProfileActiveMods ] = useState<string[]>([])
    const [ profileRuntime, setProfileRuntime ] = useState<string>("None");
    const [ allMods, setAllMods ] = useState(["AmethystRuntime@1.2.0"])

    const [ allMinecraftVersions, setAllMinecraftVersions ] = useState<string[]>(["1.20.51.1"]);
    const [ profileMinecraftVersion, setProfileMinecraftVersion ] = useState<string>("");

    return (
        <MainPanel>
            <DividedSection>
                <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
            </DividedSection>

            {/* Versioning */}
            <DividedSection>
                <Dropdown 
                    labelText="Minecraft Version" 
                    value={ profileMinecraftVersion }
                    setValue={ setProfileMinecraftVersion }
                    options={ allMinecraftVersions }
                    id="minecraft-version"
                />
            </DividedSection>

            {/* Mod Selection */}
            <DividedSection className="flex-1">
                <div className="bg-red-500 ">
                    e
                </div>
            </DividedSection>
        </MainPanel>
    )
}