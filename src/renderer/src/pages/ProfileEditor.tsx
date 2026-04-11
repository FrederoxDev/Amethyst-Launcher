import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { Popup, PopupUseArguments } from "@renderer/states/PopupStore";
import { useAppStore } from "@renderer/states/AppStore";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";
import { launchProfile as doLaunchProfile } from "@renderer/scripts/LaunchUtils";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron");

function getModIconPath(modsPath: string, modName: string): string | null {
    const iconPath = path.join(modsPath, modName, "resource_packs", "main_rp", "pack_icon.png");
    return fs.existsSync(iconPath) ? iconPath : null;
}

function AddContentPopup({ submit: rawSubmit }: PopupUseArguments<string | "browse" | null>) {
    const animateClose = usePopupClose();
    const submit = (val: string | "browse" | null) => animateClose(() => rawSubmit(val));
    const mods = useAppStore(state => state.allValidMods);
    const setError = useAppStore(state => state.setError);
    const activeMods = useAppStore(state => state.allProfiles)[useAppStore(state => state.selectedProfile)]?.mods ?? [];
    const modsPath = useMemo(() => useAppStore.getState().platform.getPaths().modsPath, []);
    const availableMods = useMemo(() => mods.filter(m => !activeMods.includes(m)), [mods, activeMods]);
    const [search, setSearch] = useState("");
    const filtered = useMemo(() => {
        if (!search) return availableMods;
        const q = search.toLowerCase();
        return availableMods.filter(m => m.toLowerCase().includes(q));
    }, [availableMods, search]);

    return (
        <PopupPanel onExit={() => submit(null)}>
            <div className="version-picker" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>Add Content</p>
                    <div className="version-popup-close" onClick={() => submit(null)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div style={{ padding: "8px" }}>
                    <div className="mod-search-box">
                        <svg className="mod-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6f6f6f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8" />
                            <line x1="21" y1="21" x2="16.65" y2="16.65" />
                        </svg>
                        <input
                            type="text"
                            className="minecraft-seven mod-search-input"
                            spellCheck={false}
                            placeholder="Search local mods..."
                            value={search}
                            onInput={e => setSearch(e.currentTarget.value)}
                        />
                    </div>
                </div>
                <div className="version-picker-list scrollbar">
                    {filtered.length === 0 && (
                        <p className="minecraft-seven" style={{ color: "#9f9f9f", padding: "12px", textAlign: "center" }}>
                            {search ? "No mods match your search." : "No local mods available."}
                        </p>
                    )}
                    {filtered.map(mod => {
                        const iconPath = getModIconPath(modsPath, mod);
                        return (
                            <div key={mod} className="version-picker-item" style={{ justifyContent: "flex-start", gap: 10, padding: "4px 6px" }} onClick={() => submit(mod)}>
                                <div className="profile-editor-mod-icon">
                                    {iconPath
                                        ? <img src={`file://${iconPath}`} width="36" height="36" className="pixelated" style={{ borderRadius: 3 }} alt="" />
                                        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <rect x="2" y="2" width="12" height="12" rx="2" stroke="#6f6f6f" strokeWidth="1.5" />
                                            <path d="M5 8h6M8 5v6" stroke="#6f6f6f" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>}
                                </div>
                                <p className="minecraft-seven">{mod}</p>
                            </div>
                        );
                    })}
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-footer" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <MinecraftButton text="Browse Mods" style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "140px" }} onClick={() => submit("browse")} />
                    <MinecraftButton text="Open Mods Folder" colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }} onClick={async () => {
                        try {
                            if (!fs.existsSync(modsPath)) {
                                fs.mkdirSync(modsPath, { recursive: true });
                            }

                            const openError = await shell.openPath(modsPath);
                            if (openError) {
                                const message = `Failed to open mods folder: ${openError}`;
                                console.error(message);
                                setError(message);
                            }
                        }
                        catch (e) {
                            const message = `Failed to open mods folder: ${(e as Error).message}`;
                            console.error(message);
                            setError(message);
                        }
                    }} />
                </div>
            </div>
        </PopupPanel>
    );
}

export function ProfileEditor() {
    const [profileName, setProfileName] = useState("");
    const [profileActiveMods, setProfileActiveMods] = useState<string[]>([]);
    const [profileRuntime, setProfileRuntime] = useState<string>("");
    const [profileMinecraftVersion, setProfileMinecraftVersion] = useState<string>("");
    const [profileVersionUuid, setProfileVersionUuid] = useState<string | null>(null);
    const [modSearch, setModSearch] = useState("");

    const [showMenu, setShowMenu] = useState(false);
    const dotsRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
    const [, forceUpdate] = useReducer(x => x + 1, 0);
    const allValidMods = useAppStore(state => state.allValidMods);
    const allProfiles = useAppStore(state => state.allProfiles);
    const setAllProfiles = useAppStore(state => state.setAllProfiles);
    const selectedProfile = useAppStore(state => state.selectedProfile);
    const saveData = useAppStore(state => state.saveData);
    const allInvalidMods = useAppStore(state => state.allInvalidMods);
    const downloadingMods = useAppStore(state => state.downloadingMods);
    const allMods = useAppStore(state => state.allMods);
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
        return () => { unsubInstall(); unsubUninstall(); };
    }, []);

    const platform = useAppStore(state => state.platform);
    const modsPath = useMemo(() => platform.getPaths().modsPath, [platform]);

    const profileLoaded = useRef(false);

    const loadProfile = useCallback(() => {
        const profile = allProfiles[selectedProfile];
        setProfileName(profile?.name ?? "New Profile");
        setProfileRuntime(profile?.runtime ?? "Vanilla");
        setProfileActiveMods(profile?.mods ?? []);
        setProfileMinecraftVersion(profile?.minecraft_version ?? "1.21.0.3");
        setProfileVersionUuid(profile?.version_uuid ?? null);
        profileLoaded.current = true;
    }, [allProfiles, selectedProfile]);

    // Auto-save on every change (skip until profile is loaded to avoid overwriting with empty state)
    useEffect(() => {
        if (!profileLoaded.current) return;
        const profile = allProfiles[selectedProfile];
        if (!profile) return;
        profile.name = profileName;
        profile.runtime = profileActiveMods.length > 0 ? profileRuntime : "Vanilla";
        profile.mods = profileActiveMods;
        profile.minecraft_version = profileMinecraftVersion;
        profile.version_uuid = profileVersionUuid;
        saveData();
    }, [profileName, profileRuntime, profileActiveMods, profileMinecraftVersion, profileVersionUuid]);

    const getOrphanedMods = (modNames: string[], excludeProfileIndex: number) => {
        return modNames.filter(modName => {
            if (modName.includes("0.0.0-dev")) return false;
            const otherProfilesUsingMod = allProfiles.filter((p, i) =>
                i !== excludeProfileIndex && p.mods.includes(modName)
            );
            return otherProfilesUsingMod.length === 0;
        });
    };

    const promptDeleteOrphanedMods = async (orphanedMods: string[]): Promise<boolean> => {
        if (orphanedMods.length === 0) return true;

        const result = await Popup.useAsync<"delete" | "keep" | null>(({ submit }) => (
            <PopupPanel onExit={() => submit(null)}>
                <div className="version-picker" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
                    <div className="version-picker-header">
                        <p className="minecraft-seven" style={{ fontSize: "16px" }}>Delete Mods?</p>
                        <div className="version-popup-close" onClick={() => submit(null)}>
                            <svg width="20" height="20" viewBox="0 0 12 12">
                                <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                    points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                            </svg>
                        </div>
                    </div>
                    <div className="version-picker-divider" />
                    <div style={{ padding: "12px 16px" }}>
                        <p className="minecraft-seven" style={{ color: "#9f9f9f", fontSize: "12px", marginBottom: 8 }}>
                            {orphanedMods.length === 1
                                ? "This mod is not used by any other profile:"
                                : "These mods are not used by any other profile:"}
                        </p>
                        {orphanedMods.map(name => (
                            <p key={name} className="minecraft-seven" style={{ color: "white", fontSize: "13px", padding: "2px 0" }}>{name}</p>
                        ))}
                    </div>
                    <div className="version-picker-divider" />
                    <div className="version-picker-footer" style={{ justifyContent: "flex-start", gap: 8 }}>
                        <MinecraftButton text="Delete from Disk" style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }} onClick={() => submit("delete")} />
                        <MinecraftButton text="Keep Files" colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "120px" }} onClick={() => submit("keep")} />
                    </div>
                </div>
            </PopupPanel>
        ));

        if (result === null) return false; // cancelled
        if (result === "delete") {
            for (const modName of orphanedMods) {
                const modPath = path.join(modsPath, modName);
                if (fs.existsSync(modPath)) {
                    fs.rmSync(modPath, { recursive: true, force: true });
                }
            }
        }
        return true;
    };

    const removeMod = async (modName: string) => {
        const orphaned = getOrphanedMods([modName], selectedProfile);
        const proceed = await promptDeleteOrphanedMods(orphaned);
        if (!proceed) return;
        setProfileActiveMods(profileActiveMods.filter(m => m !== modName));
        useAppStore.getState().refreshAllMods();
    };

    const deleteProfile = async () => {
        const profile = allProfiles[selectedProfile];
        if (profile) {
            const orphaned = getOrphanedMods(profile.mods, selectedProfile);
            const proceed = await promptDeleteOrphanedMods(orphaned);
            if (!proceed) return;
        }
        allProfiles.splice(selectedProfile, 1);
        setAllProfiles(allProfiles);
        saveData();
        useAppStore.getState().refreshAllMods();
        navigate("/");
    };

    const onPlay = async () => {
        const profile = allProfiles[selectedProfile];
        if (!profile) return;

        try {
            await doLaunchProfile(profile);
        }
        catch (e) {
            useAppStore.getState().setError((e as Error).message);
        }
    };

    // Close menu on outside click
    useEffect(() => {
        if (!showMenu) return;
        const handleClick = (e: MouseEvent) => {
            if (
                dotsRef.current && !dotsRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setShowMenu(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [showMenu]);

    useEffect(() => {
        if (!showMenu || !dotsRef.current) return;
        const rect = dotsRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 10,
            right: window.innerWidth - rect.right,
        });
    }, [showMenu]);

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    const openAddContent = async () => {
        useAppStore.getState().refreshAllMods();

        const result = await Popup.useAsync<string | "browse" | null>(props => {
            return <AddContentPopup {...props} />;
        });

        if (result === null) return;
        if (result === "browse") {
            useAppStore.getState().setInstallingForProfile(selectedProfile);
            navigate("/mod-discovery");
            return;
        }
        if (!profileActiveMods.includes(result)) {
            setProfileActiveMods([...profileActiveMods, result]);
        }
    };

    const openVersionPicker = async () => {
        const result = await Popup.useAsync<VersionPickerResult | null>(props => {
            return <VersionPickerPopup {...props} />;
        });
        if (!result) return;
        setProfileMinecraftVersion(result.minecraft_version);
        setProfileVersionUuid(result.version_uuid);
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
        const runtimeSet = new Set(
            allMods
                .filter(mod => mod.ok && mod.config.meta.type === "runtime")
                .map(mod => mod.id)
        );

        const modsWithMeta = profileActiveMods.map(name => ({
            name,
            exists: allValidMods.includes(name),
            isDownloading: downloadingMods.includes(name),
        }));

        const runtimeMods = modsWithMeta.filter(mod => runtimeSet.has(mod.name));
        const nonRuntimeMods = modsWithMeta.filter(mod => !runtimeSet.has(mod.name));

        return [...runtimeMods, ...nonRuntimeMods];
    }, [profileActiveMods, allValidMods, downloadingMods, allMods]);

    const filteredModsList = useMemo(() => {
        if (!modSearch) return allModsList;
        const q = modSearch.toLowerCase();
        return allModsList.filter(mod => mod.name.toLowerCase().includes(q));
    }, [allModsList, modSearch]);

    const runtimeWarning = useMemo(() => {
        const currentProfile = allProfiles[selectedProfile];
        const isModdedProfile = (currentProfile?.is_modded ?? false) || profileActiveMods.length > 0 || profileRuntime.toLowerCase() !== "vanilla";
        if (!isModdedProfile) {
            return null;
        }

        const runtimeMods = allMods.filter(mod => mod.ok && profileActiveMods.includes(mod.id) && mod.config.meta.type === "runtime");
        if (runtimeMods.length === 0) {
            return "Modded Profiles must have a Runtime Mod";
        }

        if (runtimeMods.length > 1) {
            return `Modded Profiles can only have one Runtime Mod. Found: ${runtimeMods.map(mod => `'${mod.id}'`).join(", ")}`;
        }

        return null;
    }, [allProfiles, selectedProfile, profileActiveMods, profileRuntime, allMods]);

    return (
        <div className="profile-editor-page">
            {allInvalidMods.length > 0 && (
                <p className="minecraft-seven profile-editor-invalid-mods">
                    Failed to show {allInvalidMods.length} mods! See Mod Manager for details
                </p>
            )}

            <div className="profile-editor-mod-section">
                <div className="profile-editor-mod-header">
                    <div className="profile-editor-header-left">
                        <div className="profile-editor-header-fields">
                            <TextInput label="Profile Name" text={profileName} setText={setProfileName} />
                            <div className="profile-editor-field">
                                <p className="minecraft-seven text-input-label" style={{ paddingBottom: 2 }}>Minecraft Version</p>
                                <div className="profile-editor-version-btn" onClick={openVersionPicker}>
                                    <p className="minecraft-seven">{versionDisplayName}</p>
                                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                                        <path d="M3 5L6 8L9 5" stroke="#9f9f9f" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                                    </svg>
                                </div>
                            </div>
                        </div>
                        <div className="mod-search-box">
                            <svg className="mod-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6f6f6f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
                            <div className="profile-editor-play-wrap">
                                <div className="launcher-profile-card-play">
                                    <MinecraftButton text="Play" onClick={onPlay} disabled={!!runtimeWarning} style={{ "--mc-button-container-h": "36px" }} />
                                </div>
                                {runtimeWarning && (
                                    <div className="profile-editor-play-warning-tooltip minecraft-seven">{runtimeWarning}</div>
                                )}
                            </div>
                            <div className="launcher-profile-card-menu" onClick={e => e.stopPropagation()}>
                                <div className="launcher-profile-card-dots" ref={dotsRef} onClick={() => setShowMenu(!showMenu)}>
                                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                        <circle cx="8" cy="3" r="1.5" fill="#FFFFFF" />
                                        <circle cx="8" cy="8" r="1.5" fill="#FFFFFF" />
                                        <circle cx="8" cy="13" r="1.5" fill="#FFFFFF" />
                                    </svg>
                                </div>
                                {showMenu && createPortal(
                                    <div
                                        className="launcher-profile-card-dropdown"
                                        ref={dropdownRef}
                                        style={{ top: dropdownPos.top, right: dropdownPos.right }}
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <div className="launcher-profile-card-dropdown-item launcher-profile-card-dropdown-item--danger" onClick={() => { deleteProfile(); setShowMenu(false); }}>
                                            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                                                <path d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                            </svg>
                                            <p className="minecraft-seven">Delete Profile</p>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                        <MinecraftButton text="Add Content" onClick={openAddContent} colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "34px", "--mc-button-container-w": "100%" }} />
                    </div>
                </div>
                <div className="profile-editor-mod-divider" />
                <div className="profile-editor-mod-list scrollbar">
                    {filteredModsList.length === 0 && (
                        <p className="minecraft-seven" style={{ color: "#9f9f9f", padding: "12px", textAlign: "center" }}>
                            {modSearch ? "No mods match your search." : "No mods installed."}
                        </p>
                    )}
                    {filteredModsList.map(mod => (
                        <div
                            key={mod.name}
                            className="profile-editor-mod-row"
                        >
                            <div className="profile-editor-mod-icon">
                                {(() => {
                                    const iconPath = getModIconPath(modsPath, mod.name);
                                    return iconPath
                                        ? <img src={`file://${iconPath}`} width="36" height="36" className="pixelated" style={{ borderRadius: 3 }} alt="" />
                                        : <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                                            <rect x="2" y="2" width="12" height="12" rx="2" stroke="#6f6f6f" strokeWidth="1.5" />
                                            <path d="M5 8h6M8 5v6" stroke="#6f6f6f" strokeWidth="1.5" strokeLinecap="round" />
                                        </svg>;
                                })()}
                            </div>
                            <div className="profile-editor-mod-row-info">
                                <p className={`minecraft-seven ${mod.exists ? "" : "profile-editor-mod-missing"}`}>
                                    {mod.name}
                                </p>
                                {mod.isDownloading && (
                                    <span className="minecraft-seven profile-editor-mod-downloading">Downloading...</span>
                                )}
                            </div>
                            <div
                                    className="profile-editor-mod-delete"
                                    onClick={() => removeMod(mod.name)}
                                >
                                    <svg width="14" height="14" viewBox="0 0 12 12">
                                        <path d="M3 3L9 9M9 3L3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                                    </svg>
                                </div>
                        </div>
                    ))}
                </div>
            </div>

        </div>
    );
}
