import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Dropdown } from "@renderer/components/Dropdown";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { TextInput } from "@renderer/components/TextInput";

import { UseAppState } from "@renderer/contexts/AppState";

import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { MinecraftVersion, MinecraftVersionType } from "@renderer/scripts/Versions";

export function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileActiveMods, setProfileActiveMods] = useState<string[]>([]);
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");

    const allValidMods = UseAppState(state => state.allValidMods);
    const allRuntimes = UseAppState(state => state.allRuntimes);
    const allMinecraftVersions = UseAppState(state => state.allMinecraftVersions);
    const allProfiles = UseAppState(state => state.allProfiles);
    const setAllProfiles = UseAppState(state => state.setAllProfiles);
    const selectedProfile = UseAppState(state => state.selectedProfile);
    const saveData = UseAppState(state => state.saveData);
    const allInvalidMods = UseAppState(state => state.allInvalidMods);
    const navigate = useNavigate();

    useEffect(() => {
        if (allProfiles.length === 0) {
            navigate("/profiles");
        }
    }, [allProfiles, navigate]);

    const toggleModActive = (name: string) => {
        if (profileActiveMods.includes(name)) {
            const newActive = profileActiveMods.filter(m => m !== name);
            setProfileActiveMods(newActive);
        } else {
            const newActive = [...profileActiveMods, name];
            setProfileActiveMods(newActive);
        }
    };

    const ModButton = ({ name, exists }: { name: string; exists: boolean }) => {
        return (
            <div
                className="profile-editor-mod-card"
                onClick={() => {
                    if (profileRuntime === "Vanilla") {
                        alert("Cannot add mods to a vanilla profile");
                        return;
                    }

                    toggleModActive(name);
                }}
            >
                <div className="profile-editor-mod-card-inner">
                    <p
                        className={`minecraft-seven ${exists ? "profile-editor-mod-exists" : "profile-editor-mod-missing"}`}
                        title={exists ? undefined : `${name} is missing, click to remove from profile`}
                    >
                        {name}
                    </p>
                </div>
            </div>
        );
    };

    const loadProfile = useCallback(() => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileActiveMods(profile?.mods ?? []);
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.21.0.3");
    }, [allProfiles, selectedProfile]);

    const saveProfile = () => {
        allProfiles[selectedProfile].name = profileName;

        allProfiles[selectedProfile].runtime = profileRuntime;
        allProfiles[selectedProfile].mods = profileActiveMods;
        allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion;

        console.log("Saving profile:", allProfiles[selectedProfile]);
        saveData();
        navigate("/profiles");
    };

    const deleteProfile = () => {
        allProfiles.splice(selectedProfile, 1);
        setAllProfiles(allProfiles);

        saveData();
        navigate("/profiles");
    };

    useEffect(() => {
        loadProfile();
        saveData();
    }, [loadProfile]);

    const filterVersion = (version: MinecraftVersion): boolean => {
        return version.versionType === MinecraftVersionType.UwpStable;
    };

    const formatVersionName = (version: MinecraftVersion): string => {
        return SemVersion.toString(version.version);
    };

    return (
        <MainPanel>
            <div className="profile-editor">
                {/* Settings */}
                <div className="profile-editor-settings">
                    <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                    <Dropdown
                        labelText="Minecraft Version"
                        value={profileMinecraftVersion}
                        setValue={setProfileMinecraftVersion}
                        options={allMinecraftVersions.filter(filterVersion).map(formatVersionName)}
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

                {allInvalidMods.length > 0 && (
                    <p className="minecraft-seven profile-editor-invalid-mods">
                        Failed to show {allInvalidMods.length} mods! See Mod Manager for details
                    </p>
                )}

                {/* Mod Selection */}
                {profileRuntime === "Vanilla" ? (
                    <div className="profile-editor-vanilla">
                        <div className="profile-editor-vanilla-inner"></div>
                    </div>
                ) : (
                    <div className="profile-editor-mods">
                        <div className="profile-editor-column">
                            <p className="minecraft-seven profile-editor-column-title">Active Mods</p>
                            <div className="profile-editor-mod-list">
                                {profileActiveMods.length > 0 ? (
                                    profileActiveMods.map((mod, index) => (
                                        <ModButton name={mod} exists={allValidMods.includes(mod)} key={index} />
                                    ))
                                ) : (
                                    <></>
                                )}
                            </div>
                        </div>
                        <div className="profile-editor-column">
                            <p className="minecraft-seven profile-editor-column-title">Inactive Mods</p>
                            <div className="profile-editor-mod-list">
                                {allValidMods.length > 0 ? (
                                    allValidMods
                                        .filter(mod => !profileActiveMods.includes(mod))
                                        .map((mod, index) => (
                                            <ModButton name={mod} exists={allValidMods.includes(mod)} key={index} />
                                        ))
                                ) : (
                                    <></>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* Profile Actions */}
                <div className="profile-editor-actions">
                    <MinecraftButton text="Save Profile" onClick={() => saveProfile()} />
                    <MinecraftButton
                        text="Delete Profile"
                        style={MinecraftButtonStyle.Warn}
                        onClick={() => deleteProfile()}
                    />
                </div>
            </div>
        </MainPanel>
    );
}
