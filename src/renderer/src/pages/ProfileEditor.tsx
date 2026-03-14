import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
import { useNavigate } from "react-router-dom";

import { Dropdown, DropdownOption } from "@renderer/components/Dropdown";
import { MainPanel } from "@renderer/components/MainPanel";
import { MinecraftButton, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { TextInput } from "@renderer/components/TextInput";
import { useAppStore } from "@renderer/states/AppStore";
import { MinecraftToggle } from "@renderer/components/MinecraftToggle";
import { MinecraftVersionData } from "@renderer/scripts/VersionDatabase";

export function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileActiveMods, setProfileActiveMods] = useState<string[]>([]);
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");
    const [profileVersionUuid, setProfileVersionUuid] = useState<string | null>(null);
    const [remoteVersions, setRemoteVersions] = useState<MinecraftVersionData[]>([]);

    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const allValidMods = useAppStore(state => state.allValidMods);
    const allRuntimes = useAppStore(state => state.allRuntimes);
    const allProfiles = useAppStore(state => state.allProfiles);
    const setAllProfiles = useAppStore(state => state.setAllProfiles);
    const selectedProfile = useAppStore(state => state.selectedProfile);
    const saveData = useAppStore(state => state.saveData);
    const allInvalidMods = useAppStore(state => state.allInvalidMods);
    const versionManager = useAppStore(state => state.versionManager);
    const platform = useAppStore(state => state.platform);
    const navigate = useNavigate();

    useEffect(() => {
        if (allProfiles.length === 0) {
            navigate("/profiles");
        }
    }, [allProfiles, navigate]);

    useEffect(() => {
        const fetchVersions = async () => {
            try {
                const versions = await versionManager.database.update();
                if (versions instanceof Error)
                    throw versions;
                setRemoteVersions([...versions]);
            }
            catch (e) {
                console.error("Failed to fetch versions from database:", e);
            }
        };

        fetchVersions();

        const unsubInstall = versionManager.subscribe("version_installed", () => forceUpdate());
        const unsubUninstall = versionManager.subscribe("version_uninstalled", () => forceUpdate());
        return () => { unsubInstall(); unsubUninstall(); };
    }, []);

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
        setProfileVersionUuid(profile?.version_uuid ?? null);
    }, [allProfiles, selectedProfile]);

    const saveProfile = async () => {
        allProfiles[selectedProfile].name = profileName;

        allProfiles[selectedProfile].runtime = profileRuntime;
        allProfiles[selectedProfile].mods = profileActiveMods;
        allProfiles[selectedProfile].minecraft_version = profileMinecraftVersion;
        allProfiles[selectedProfile].version_uuid = profileVersionUuid;

        console.log("Saving profile:", allProfiles[selectedProfile]);
        platform.createShortcut({
            name: profileName,
            target: `amethyst-launcher://launchprofile/${allProfiles[selectedProfile].uuid}`,
            description: `Launches the ${profileName} profile with Amethyst Launcher`,
        });
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
    }, [loadProfile]);

    const formatVersionName = (version: MinecraftVersionData): string => {
        return version.version.toString();
    };

    const installedVersions = useMemo(() => versionManager.getInstalledVersions(), [versionManager, remoteVersions]);

    const versionOptions = useMemo(() => {
        const installed = installedVersions.map(v => ({
            label: v.name,
            value: `uuid:${v.uuid}`
        }));
        const remote = remoteVersions.map(v => ({
            label: formatVersionName(v),
            value: formatVersionName(v)
        }));
        // Merge installed first, then remote (no dedup needed since UUIDs won't collide with version strings)
        return [...installed, ...remote];
    }, [remoteVersions, installedVersions]);

    return (
        <MainPanel>
            <div className="profile-editor">
                {/* Settings */}
                <div className="profile-editor-settings">
                    <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                    <Dropdown
                        labelText="Minecraft Version"
                        value={profileVersionUuid ? `uuid:${profileVersionUuid}` : profileMinecraftVersion}
                        setValue={(val) => {
                            const value = typeof val === "function" ? val("") : val;
                            if (value.startsWith("uuid:")) {
                                const uuid = value.slice(5);
                                setProfileVersionUuid(uuid);
                                const installed = installedVersions.find(v => v.uuid === uuid);
                                setProfileMinecraftVersion(installed?.version.toString() ?? "");
                            } else {
                                setProfileVersionUuid(null);
                                setProfileMinecraftVersion(value);
                            }
                        }}
                        options={versionOptions}
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
                <div className="profile-editor-mod-list" style={{
                    display: "flex",
                    flexDirection: "column",
                    height: "fit-content",
                    flex: "shrink",
                    flexGrow: 0
                }}>
                    <div className="settings-section">
                        <div className="settings-row">
                            <div>
                                <p className="minecraft-seven settings-title">{"Use split data folder for profile"}</p>
                                <p className="minecraft-seven settings-subtitle">
                                    {"Makes a different folder for the data of this profile."}
                                </p>
                                <p className="minecraft-seven settings-subtitle">
                                    {"Current folder: "}
                                </p>
                            </div>
                            <div className="settings-toggle-wrap">
                                <MinecraftToggle
                                    isChecked={false}
                                    setIsChecked={isChecked => {

                                    }}
                                />
                            </div>
                        </div>
                    </div>
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
                    <MinecraftButton text="Save Profile" onClick={() => saveProfile()}/>
                    <MinecraftButton
                        text="Delete Profile"
                        onClick={() => deleteProfile()}
                        colorPallete={RED_MINECRAFT_BUTTON}
                    />
                </div>
            </div>
        </MainPanel>
    );
}
