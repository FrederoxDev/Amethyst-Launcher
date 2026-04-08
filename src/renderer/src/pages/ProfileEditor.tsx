import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { ThreeDotsMenu } from "@renderer/components/ThreeDotsMenu";
import { Popup, PopupUseArguments } from "@renderer/states/PopupStore";
import { useAppStore } from "@renderer/states/AppStore";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";
import { launchProfile as doLaunchProfile } from "@renderer/scripts/LaunchUtils";
import { AskConfirmDelete } from "@renderer/components/ConfirmDeletePopup";
import { DeleteProfileFolder, GetProfileModsPath } from "@renderer/scripts/Profiles";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron");

function getModIconPath(modsPath: string, modName: string): string | null {
    const iconPath = path.join(modsPath, modName, "resource_packs", "main_rp", "pack_icon.png");
    return fs.existsSync(iconPath) ? iconPath : null;
}

function AddContentPopup({ submit: rawSubmit }: PopupUseArguments<"browse" | null>) {
    const animateClose = usePopupClose();
    const submit = (val: "browse" | null): void => animateClose(() => rawSubmit(val));
    const selectedProfileUuid = useAppStore(state => state.allProfiles[state.selectedProfile]?.uuid ?? "");
    const modsPath = useMemo(() => GetProfileModsPath(selectedProfileUuid), [selectedProfileUuid]);

    return (
        <PopupPanel onExit={() => submit(null)}>
            <div className="version-picker" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>
                        Add Content
                    </p>
                    <div className="version-popup-close" onClick={() => submit(null)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon
                                className="fill-[#FFFFFF]"
                                fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                            />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-divider" />
                <div className="version-picker-footer" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <MinecraftButton
                        text="Browse Mods"
                        style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "140px" }}
                        onClick={() => submit("browse")}
                    />
                    <MinecraftButton
                        text="Open Mods Folder"
                        colorPallete={GRAY_MINECRAFT_BUTTON}
                        style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }}
                        onClick={() => shell.openPath(modsPath)}
                    />
                </div>
            </div>
        </PopupPanel>
    );
}

export function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");
    const [profileVersionUuid, setProfileVersionUuid] = useState<string | null>(null);
    const [modSearch, setModSearch] = useState("");
    const [, forceUpdate] = useReducer(x => x + 1, 0);

    const allMods = useAppStore(state => state.allMods);
    const allProfiles = useAppStore(state => state.allProfiles);
    const setAllProfiles = useAppStore(state => state.setAllProfiles);
    const selectedProfile = useAppStore(state => state.selectedProfile);
    const saveData = useAppStore(state => state.saveData);
    const allInvalidMods = useAppStore(state => state.allInvalidMods);
    const downloadingMods = useAppStore(state => state.downloadingMods);
    const versionManager = useAppStore(state => state.versionManager);
    const navigate = useNavigate();

    useEffect(() => {
        if (allProfiles.length === 0) {
            navigate("/profiles");
        }
    }, [allProfiles, navigate]);

    useEffect(() => {
        const unsubInstall = versionManager.subscribe("version_installed", () => forceUpdate());
        const unsubUninstall = versionManager.subscribe("version_uninstalled", () => forceUpdate());
        return () => {
            unsubInstall();
            unsubUninstall();
        };
    }, []);

    const modsPath = useMemo(() => {
        const profile = allProfiles[selectedProfile];
        return profile ? GetProfileModsPath(profile.uuid) : "";
    }, [allProfiles, selectedProfile]);

    const profileLoaded = useRef(false);

    const loadProfile = useCallback(() => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.21.0.3");
        setProfileVersionUuid(profile?.version_uuid ?? null);
        profileLoaded.current = true;
        useAppStore.getState().refreshAllMods();
    }, [allProfiles, selectedProfile]);

    useEffect(() => {
        if (!profileLoaded.current) return;
        const profile = allProfiles[selectedProfile];
        if (!profile) return;
        profile.name = profileName;
        profile.runtime = profileRuntime;
        profile.minecraft_version = profileMinecraftVersion;
        profile.version_uuid = profileVersionUuid;
        saveData();
    }, [profileName, profileRuntime, profileMinecraftVersion, profileVersionUuid]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const removeMod = async (modName: string) => {
        const modPath = path.join(modsPath, modName);
        if (fs.existsSync(modPath)) {
            fs.rmSync(modPath, { recursive: true, force: true });
        }
        useAppStore.getState().refreshAllMods();
    };

    const deleteProfile = async () => {
        const profile = allProfiles[selectedProfile];
        if (useAppStore.getState().confirmDelete) {
            const confirmed = await AskConfirmDelete(
                "Delete profile?",
                `Are you sure you want to delete "${profile?.name ?? "this profile"}"?`
            );
            if (!confirmed) return;
        }
        allProfiles.splice(selectedProfile, 1);
        setAllProfiles(allProfiles);
        if (profile) {
            DeleteProfileFolder(profile.uuid);
        }
        saveData();
        useAppStore.getState().refreshAllMods();
        navigate("/");
    };

    const onPlay = async () => {
        const profile = allProfiles[selectedProfile];
        if (profile) await doLaunchProfile(profile);
    };

    const openAddContent = async () => {
        const result = await Popup.useAsync<"browse" | null>(props => {
            return <AddContentPopup {...props} />;
        });

        if (result !== "browse") return;
        const profile = allProfiles[selectedProfile];
        if (profile) useAppStore.getState().setInstallingForProfile(profile.uuid);
        navigate("/mod-discovery");
    };

    const openVersionPicker = async () => {
        const result = await Popup.useAsync<VersionPickerResult | null>(props => {
            return <VersionPickerPopup {...props} />;
        });
        if (!result) return;
        setProfileMinecraftVersion(result.minecraft_version);
        setProfileVersionUuid(result.version_uuid);
    };

    const openProfileFolder = () => {
        const paths = useAppStore.getState().platform.getPaths();
        const uuid = allProfiles[selectedProfile]?.uuid;
        if (uuid) shell.openPath(path.join(paths.profilesPath, uuid));
    };

    const installedVersions = useMemo(() => versionManager.getInstalledVersions(), [versionManager]);

    const versionDisplayName = useMemo(() => {
        if (profileVersionUuid) {
            const installed = installedVersions.find(v => v.uuid === profileVersionUuid);
            return installed?.name ?? profileMinecraftVersion;
        }
        return profileMinecraftVersion || "Select version...";
    }, [profileVersionUuid, profileMinecraftVersion, installedVersions]);

    const allModsList = useMemo(() => {
        return allMods.map(mod => ({
            name: mod.id,
            exists: mod.ok,
            isDownloading: downloadingMods.includes(mod.id),
        }));
    }, [allMods, downloadingMods]);

    const filteredModsList = useMemo(() => {
        if (!modSearch) return allModsList;
        const q = modSearch.toLowerCase();
        return allModsList.filter(mod => mod.name.toLowerCase().includes(q));
    }, [allModsList, modSearch]);

    return (
        <div className="profile-editor-page">
            {allInvalidMods.length > 0 && (
                <p className="minecraft-seven profile-editor-invalid-mods">
                    Failed to show {allInvalidMods.length} mod(s)! See Mod Manager for details
                </p>
            )}

            <div className="profile-editor-mod-section">
                <div className="profile-editor-mod-header">
                    <div className="profile-editor-header-left">
                        <div className="profile-editor-header-fields">
                            <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                            <div className="profile-editor-field">
                                <p className="minecraft-seven text-input-label" style={{ paddingBottom: 2 }}>
                                    Minecraft Version
                                </p>
                                <div className="profile-editor-version-btn" onClick={openVersionPicker}>
                                    <p className="minecraft-seven">{versionDisplayName}</p>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path
                                            d="M3 5L6 8L9 5"
                                            stroke="#9f9f9f"
                                            strokeWidth="1.5"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                        />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="mod-search-box">
                            <svg
                                className="mod-search-icon"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="#6f6f6f"
                                strokeWidth="2.5"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                            >
                                <circle cx="11" cy="11" r="8" />
                                <line x1="21" y1="21" x2="16.65" y2="16.65" />
                            </svg>
                            <input
                                type="text"
                                className="minecraft-seven mod-search-input"
                                spellCheck={false}
                                placeholder="Search mods..."
                                value={modSearch}
                                onInput={e => setModSearch(e.currentTarget.value)}
                            />
                        </div>
                    </div>
                    <div className="profile-editor-header-right">
                        <div className="profile-editor-name-actions">
                            <div className="launcher-profile-card-play">
                                <MinecraftButton
                                    text="Play"
                                    onClick={onPlay}
                                    style={{ "--mc-button-container-h": "36px" }}
                                />
                            </div>
                            <ThreeDotsMenu items={[
                                {
                                    label: "Open Folder",
                                    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" /></svg>,
                                    onClick: openProfileFolder,
                                },
                                {
                                    label: "Delete Profile",
                                    icon: <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>,
                                    onClick: deleteProfile,
                                    danger: true,
                                },
                            ]} />
                        </div>
                        <MinecraftButton
                            text="Add Content"
                            onClick={openAddContent}
                            colorPallete={GRAY_MINECRAFT_BUTTON}
                            style={{ "--mc-button-container-h": "34px", "--mc-button-container-w": "100%" }}
                        />
                    </div>
                </div>
                <div className="profile-editor-mod-divider" />
                <div className="profile-editor-mod-list scrollbar">
                    {filteredModsList.length === 0 && (
                        <p
                            className="minecraft-seven"
                            style={{ color: "#9f9f9f", padding: "12px", textAlign: "center" }}
                        >
                            {modSearch ? "No mods match your search." : "No mods installed."}
                        </p>
                    )}
                    {filteredModsList.map(mod => (
                        <div key={mod.name} className="profile-editor-mod-row">
                            <div className="profile-editor-mod-icon">
                                {(() => {
                                    const iconPath = getModIconPath(modsPath, mod.name);
                                    return iconPath ? (
                                        <img
                                            src={`file://${iconPath}`}
                                            width="36"
                                            height="36"
                                            className="pixelated"
                                            style={{ borderRadius: 3 }}
                                            alt=""
                                        />
                                    ) : (
                                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <rect
                                                x="2"
                                                y="2"
                                                width="12"
                                                height="12"
                                                rx="2"
                                                stroke="#6f6f6f"
                                                strokeWidth="1.5"
                                            />
                                            <path
                                                d="M5 8h6M8 5v6"
                                                stroke="#6f6f6f"
                                                strokeWidth="1.5"
                                                strokeLinecap="round"
                                            />
                                        </svg>
                                    );
                                })()}
                            </div>
                            <div className="profile-editor-mod-row-info">
                                <p className={`minecraft-seven ${mod.exists ? "" : "profile-editor-mod-missing"}`}>
                                    {mod.name}
                                </p>
                                {mod.isDownloading && (
                                    <span className="minecraft-seven profile-editor-mod-downloading">
                                        Downloading...
                                    </span>
                                )}
                            </div>
                            <div className="profile-editor-mod-delete" onClick={() => removeMod(mod.name)}>
                                <svg width="14" height="14" viewBox="0 0 12 12">
                                    <path
                                        d="M3 3L9 9M9 3L3 9"
                                        stroke="currentColor"
                                        strokeWidth="1.5"
                                        strokeLinecap="round"
                                    />
                                </svg>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
