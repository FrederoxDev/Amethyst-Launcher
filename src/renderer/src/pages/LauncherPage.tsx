import warningIcon from "@renderer/assets/images/icons/warning-icon.png";

import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { useShallow } from "zustand/shallow";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { launchProfile } from "@renderer/scripts/LaunchUtils";
import { useNavigate } from "react-router-dom";
import { Profile } from "@renderer/scripts/Profiles";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Popup } from "@renderer/states/PopupStore";
import { VersionPickerPopup, VersionPickerResult } from "@renderer/popups/VersionPickerPopup";
import { NewInstancePopup, NewInstanceResult } from "@renderer/popups/NewInstancePopup";

const { shell } = window.require("electron") as typeof import("electron");

const ProfileCardMenu = ({ onEdit, onDelete, onOpenFolder }: {
    onEdit: () => void;
    onDelete: () => void;
    onOpenFolder: () => void;
}) => {
    const [open, setOpen] = useState(false);
    const dotsRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });

    useEffect(() => {
        if (!open) return;
        const handleClick = (e: MouseEvent) => {
            if (
                dotsRef.current && !dotsRef.current.contains(e.target as Node) &&
                dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [open]);

    useEffect(() => {
        if (!open || !dotsRef.current) return;
        const rect = dotsRef.current.getBoundingClientRect();
        setDropdownPos({
            top: rect.bottom + 10,
            right: window.innerWidth - rect.right,
        });
    }, [open]);

    return (
        <div className="launcher-profile-card-menu" onClick={(e) => e.stopPropagation()}>
            <div className="launcher-profile-card-dots" ref={dotsRef} onClick={() => setOpen(!open)}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="3" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="8" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="13" r="1.5" fill="#FFFFFF" />
                </svg>
            </div>
            {open && createPortal(
                <div
                    className="launcher-profile-card-dropdown"
                    ref={dropdownRef}
                    style={{ top: dropdownPos.top, right: dropdownPos.right }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="launcher-profile-card-dropdown-item" onClick={() => { onEdit(); setOpen(false); }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M11.293 1.293a1 1 0 0 1 1.414 0l2 2a1 1 0 0 1 0 1.414l-8.5 8.5A1 1 0 0 1 5.5 13.5H3a1 1 0 0 1-1-1V10.5a1 1 0 0 1 .293-.707l8.5-8.5Z" stroke="#FFFFFF" strokeWidth="1.5" fill="none" />
                        </svg>
                        <p className="minecraft-seven">Edit Profile</p>
                    </div>
                    <div className="launcher-profile-card-dropdown-item" onClick={() => { onOpenFolder(); setOpen(false); }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" />
                        </svg>
                        <p className="minecraft-seven">Open Folder</p>
                    </div>
                    <div className="launcher-profile-card-dropdown-item launcher-profile-card-dropdown-item--danger" onClick={() => { onDelete(); setOpen(false); }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                        </svg>
                        <p className="minecraft-seven">Delete Profile</p>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const ProfileCard = ({ profile, versionName, onEdit, onPlay, onDelete, onOpenFolder, canPlay }: {
    profile: Profile;
    versionName: string;
    onEdit: () => void;
    onPlay: () => void;
    onDelete: () => void;
    onOpenFolder: () => void;
    canPlay: boolean;
}) => {
    return (
        <div className="launcher-profile-card" data-uuid={profile.uuid} onClick={onEdit}>
            <div className="launcher-profile-card-info">
                <p className="minecraft-seven launcher-profile-card-name">{profile.name}</p>
                <p className="minecraft-seven launcher-profile-card-version">
                    {versionName} &middot; {profile.runtime}
                </p>
            </div>
            <div className="launcher-profile-card-actions" onClick={(e) => { e.stopPropagation(); }}>
                <div className="launcher-profile-card-play">
                    <MinecraftButton text="Play" onClick={onPlay} disabled={!canPlay} style={{ "--mc-button-container-h": "36px" }} />
                </div>
                <ProfileCardMenu onEdit={onEdit} onDelete={onDelete} onOpenFolder={onOpenFolder} />
            </div>
        </div>
    );
};

export function LauncherPage() {
    const [
        allProfiles,
        selectedProfile,
        setSelectedProfile,
        setAllProfiles,
        saveData,
        error,
        setError,
        minecraftIsRunning,
        versionManager
    ] = useAppStore(useShallow(state => [
        state.allProfiles,
        state.selectedProfile,
        state.setSelectedProfile,
        state.setAllProfiles,
        state.saveData,
        state.error,
        state.setError,
        state.minecraftIsRunning,
        state.versionManager
    ]));

    const getVersionName = (profile: Profile): string => {
        if (profile.version_uuid) {
            const installed = versionManager.getInstalledVersionByUUID(profile.version_uuid);
            if (installed) return installed.name;
        }
        return profile.minecraft_version ?? "No version";
    };

    const navigate = useNavigate();
    const gridRef = useRef<HTMLDivElement>(null);
    const positionsRef = useRef<Map<string, DOMRect>>(new Map());
    const prevUuidsRef = useRef<string[]>([]);

    const snapshotPositions = useCallback(() => {
        if (!gridRef.current) return;
        const map = new Map<string, DOMRect>();
        const children = gridRef.current.children;
        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement;
            const key = el.dataset.uuid;
            if (key) map.set(key, el.getBoundingClientRect());
        }
        positionsRef.current = map;
    }, []);

    useLayoutEffect(() => {
        if (!gridRef.current) return;
        const oldPositions = positionsRef.current;
        const children = gridRef.current.children;
        const oldUuids = prevUuidsRef.current;
        const newUuids = allProfiles.map(p => p.uuid);
        prevUuidsRef.current = newUuids;

        // Skip animation on initial mount / tab switch (no previous state)
        if (oldUuids.length === 0) return;

        const addedUuids = new Set(newUuids.filter(u => !oldUuids.includes(u)));

        for (let i = 0; i < children.length; i++) {
            const el = children[i] as HTMLElement;
            const key = el.dataset.uuid;
            if (!key) continue;

            if (addedUuids.has(key)) {
                el.animate([
                    { opacity: 0, transform: "scale(0.9)" },
                    { opacity: 1, transform: "scale(1)" },
                ], { duration: 150, easing: "ease-out" });
                continue;
            }

            const oldRect = oldPositions.get(key);
            if (!oldRect) continue;
            const newRect = el.getBoundingClientRect();
            const dx = oldRect.left - newRect.left;
            const dy = oldRect.top - newRect.top;
            if (dx === 0 && dy === 0) continue;

            el.animate([
                { transform: `translate(${dx}px, ${dy}px)` },
                { transform: "translate(0, 0)" },
            ], { duration: 200, easing: "cubic-bezier(0.2, 0, 0, 1)" });
        }
    }, [allProfiles]);

    const deleteProfile = (index: number) => {
        snapshotPositions();
        const newProfiles = [...allProfiles];
        newProfiles.splice(index, 1);
        setAllProfiles(newProfiles);
        saveData();
    };

    const openVersionFolder = (profile: Profile) => {
        if (profile.version_uuid) {
            const installed = versionManager.getInstalledVersionByUUID(profile.version_uuid);
            if (installed) {
                shell.openPath(installed.path);
                return;
            }
        }
        setError("No installed version folder found for this profile.");
    };

    const launchGame = async (profile: Profile) => {
        try {
            await launchProfile(profile);
        } catch (e) {
            console.error(e);
            setError((e as Error).message);
            ProgressBar.reset();
        }
    };

    return (
        <div className="launcher-page">
            {error !== "" && (
                <div className="launcher-error-banner">
                    <div className="launcher-error-body">
                        <img src={warningIcon} className="launcher-error-icon pixelated" alt="" />
                        <p className="minecraft-seven launcher-error-text">{error}</p>
                    </div>
                    <div className="launcher-error-actions">
                        <div className="launcher-error-close" onClick={() => setError("")}>
                            <svg width="18" height="18" viewBox="0 0 12 12">
                                <polygon
                                    className="fill-[#FFFFFF]"
                                    fillRule="evenodd"
                                    points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                />
                            </svg>
                        </div>
                    </div>
                </div>
            )}

            {/* Profile Grid */}
            <div className="launcher-profile-grid scrollbar" ref={gridRef}>
                {allProfiles.map((profile, index) => (
                    <ProfileCard
                        key={profile.uuid}
                        profile={profile}
                        versionName={getVersionName(profile)}
                        canPlay={ProgressBar.canDoAction("launch") && !minecraftIsRunning}
                        onEdit={() => {
                            setSelectedProfile(index);
                            navigate("/profile-editor");
                        }}
                        onPlay={() => launchGame(profile)}
                        onDelete={() => deleteProfile(index)}
                        onOpenFolder={() => openVersionFolder(profile)}
                    />
                ))}
                <div className="launcher-profile-card launcher-create-card" data-uuid="__create__" onClick={async () => {
                    let versionResult = await Popup.useAsync<VersionPickerResult | null>(props => {
                        return <VersionPickerPopup {...props} />;
                    });
                    if (!versionResult) return;

                    while (true) {
                        const instanceResult = await Popup.useAsync<NewInstanceResult | null>(props => {
                            return <NewInstancePopup {...props} versionLabel={versionResult!.display_name} />;
                        });
                        if (!instanceResult) return;
                        if (instanceResult.kind === "reselect") {
                            const newVersion = await Popup.useAsync<VersionPickerResult | null>(props => {
                                return <VersionPickerPopup {...props} />;
                            });
                            if (!newVersion) return;
                            versionResult = newVersion;
                            continue;
                        }

                        snapshotPositions();
                        const isModded = instanceResult.runtime === "modded";
                        const newProfile: Profile = {
                            uuid: crypto.randomUUID(),
                            name: instanceResult.name,
                            is_modded: isModded,
                            minecraft_version: versionResult.minecraft_version,
                            version_uuid: versionResult.version_uuid,
                            mods: [],
                            runtime: "Vanilla",
                        };
                        const newProfiles = [...allProfiles, newProfile];
                        setAllProfiles(newProfiles);
                        setSelectedProfile(newProfiles.length - 1);
                        saveData();
                        navigate(isModded ? "/profile-editor" : "/");
                        break;
                    }
                }}>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4V16M4 10H16" stroke="#9f9f9f" strokeWidth="2.5" strokeLinecap="square" />
                    </svg>
                    <p className="minecraft-seven launcher-create-card-text">Create a Profile</p>
                </div>
            </div>

            <div className="launcher-footer">
                <div className="launcher-disclaimer">
                    <p className="minecraft-seven launcher-disclaimer-text">
                        Not approved by or associated with Mojang or Microsoft
                    </p>
                </div>

            </div>
        </div>
    );
}
