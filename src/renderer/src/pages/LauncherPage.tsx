import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { useShallow } from "zustand/shallow";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { launchErrorMessage, launchProfile } from "@renderer/scripts/flows/Launch";
import { useNavigate } from "react-router-dom";
import { channelLabel } from "@renderer/scripts/domain/Channel";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { describeProblem, diagnoseProfile, launchBlocker } from "@renderer/scripts/domain/ProfileDiagnosis";
import { toModStatus } from "@renderer/scripts/Mods";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { createProfileFlow } from "@renderer/scripts/flows/CreateProfile";
import {
    confirmProfileDeletion,
    deleteProfile as removeProfile,
    displayVersion,
    openDataFolder,
    openInstallFolder,
} from "@renderer/scripts/flows/ProfileActions";

const ProfileCardMenu = ({ onEdit, onDelete, onOpenInstallFolder, onOpenDataFolder }: {
    onEdit: () => void;
    onDelete: () => void;
    onOpenInstallFolder: () => void;
    onOpenDataFolder: () => void;
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
                    <div className="launcher-profile-card-dropdown-item" onClick={() => { onOpenDataFolder(); setOpen(false); }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" />
                        </svg>
                        <p className="minecraft-seven">Open Data Folder</p>
                    </div>
                    <div className="launcher-profile-card-dropdown-item" onClick={() => { onOpenInstallFolder(); setOpen(false); }}>
                        <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z" stroke="#FFFFFF" strokeWidth="1.5" />
                        </svg>
                        <p className="minecraft-seven">Open Install Folder</p>
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

const ProfileCard = ({ profile, versionName, runtimeWarning, onEdit, onPlay, onDelete, onOpenInstallFolder, onOpenDataFolder, canPlay, isSelected }: {
    profile: Profile;
    versionName: string;
    runtimeWarning: string | null;
    onEdit: () => void;
    onPlay: () => void;
    onDelete: () => void;
    onOpenInstallFolder: () => void;
    onOpenDataFolder: () => void;
    canPlay: boolean;
    isSelected?: boolean;
}) => {
    const profileModeLabel = isModded(profile) ? "Modded" : "Vanilla";

    return (
        <div className={`launcher-profile-card${isSelected ? " selected" : ""}`} onClick={onEdit}>
            <div className="launcher-profile-card-info">
                <div className="launcher-profile-card-name-row">
                    <p className="minecraft-seven launcher-profile-card-name">{profile.name}</p>
                    {runtimeWarning && (
                        <div className="launcher-profile-card-warning-inline" role="img" aria-label={runtimeWarning}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                                <path d="M7.137 2.5a1 1 0 0 1 1.726 0l5.196 9A1 1 0 0 1 13.196 13H2.804a1 1 0 0 1-.863-1.5l5.196-9Z" fill="#F3C642" stroke="#9A7A1A" strokeWidth="1" />
                                <path d="M8 6v3.2M8 11.5h.01" stroke="#1E1E1F" strokeWidth="1.4" strokeLinecap="round" />
                            </svg>
                            <div className="launcher-profile-card-warning-tooltip minecraft-seven">{runtimeWarning}</div>
                        </div>
                    )}
                </div>
                <p className="minecraft-seven launcher-profile-card-version">
                    {versionName} &middot; {channelLabel(profile.channel)} &middot; {profileModeLabel}
                </p>
            </div>
            <div className="launcher-profile-card-actions" onClick={(e) => { e.stopPropagation(); }}>
                <div className="launcher-profile-card-play-wrap">
                    <div className="launcher-profile-card-play">
                        <MinecraftButton text="Play" onClick={onPlay} disabled={!canPlay} style={{ "--mc-button-container-h": "36px" }} />
                    </div>
                    {runtimeWarning && (
                        <div className="launcher-profile-card-play-tooltip minecraft-seven">{runtimeWarning}</div>
                    )}
                </div>
                <ProfileCardMenu onEdit={onEdit} onDelete={onDelete} onOpenInstallFolder={onOpenInstallFolder} onOpenDataFolder={onOpenDataFolder} />
            </div>
        </div>
    );
};

export function LauncherPage() {
    const [
        allProfiles,
        lastLaunchedProfileUuid,
        setEditingProfile,
        setAllProfiles,
        saveData,
        setError,
        allMods,
        downloadingMods,
    ] = useAppStore(useShallow(state => [
        state.profiles,
        state.lastLaunchedProfileUuid,
        state.setEditingProfileIndex,
        state.setProfiles,
        state.saveData,
        state.setError,
        state.allMods,
        state.downloadingMods,
    ]));

    // Subscribe to ProgressBar status so play-button gating updates reactively
    // when long-running ops (launch, import, delete, uninstall) start/finish.
    const canLaunch = ProgressBar.useCanDoAction("launch");

    const navigate = useNavigate();
    const gridRef = useRef<HTMLDivElement>(null);
    const positionsRef = useRef<Map<string, DOMRect>>(new Map());
    const prevUuidsRef = useRef<string[]>([]);
    const [dragUuid, _setDragUuid] = useState<string | null>(null);
    const dragUuidRef = useRef<string | null>(null);
    const reorderCooldown = useRef(false);
    const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
    const dragSizeRef = useRef({ width: 0, height: 0 });

    const setDragUuid = (uuid: string | null) => {
        dragUuidRef.current = uuid;
        _setDragUuid(uuid);
    };

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

    const deleteProfile = async (index: number) => {
        const profile = allProfiles[index];
        if (!profile) {
            log("LauncherPage", `Delete ignored: no profile at index ${index} of ${allProfiles.length}`);
            return;
        }
        if (!await confirmProfileDeletion(profile)) return;
        snapshotPositions();
        try {
            await removeProfile(profile);
        } catch (e) {
            log("LauncherPage", `Deleting "${profile.name}" failed: ${describeError(e)}`);
            setError(`Could not delete ${profile.name}: ${(e as Error).message ?? e}`);
        }
    };

    const handleReorder = (targetUuid: string) => {
        const currentDragUuid = dragUuidRef.current;
        if (!currentDragUuid || currentDragUuid === targetUuid || reorderCooldown.current) return;
        const fromIndex = allProfiles.findIndex(p => p.uuid === currentDragUuid);
        const toIndex = allProfiles.findIndex(p => p.uuid === targetUuid);
        if (fromIndex === -1 || toIndex === -1) return;
        snapshotPositions();
        const reordered = [...allProfiles];
        const [moved] = reordered.splice(fromIndex, 1);
        reordered.splice(toIndex, 0, moved);
        setAllProfiles(reordered);
        reorderCooldown.current = true;
        setTimeout(() => { reorderCooldown.current = false; }, 200);
    };

    const launchGame = async (profile: Profile) => {
        log("LauncherPage", `Play pressed on "${profile.name}" (${profile.uuid})`);
        try {
            await launchProfile(profile);
        } catch (e) {
            log("LauncherPage", `Launch of "${profile.name}" ended in an error shown to the user: ${describeError(e)}`);
            setError(launchErrorMessage(e));
            ProgressBar.reset();
        }
    };

    /** The profile's own reason, not a guess at it: an invalid runtime is not a missing one. */
    const getRuntimeWarning = (profile: Profile): string | null => {
        const blocker = launchBlocker(diagnoseProfile({
            modded: isModded(profile),
            modIds: profile.mods,
            mods: toModStatus(allMods),
            downloading: downloadingMods,
        }));
        return blocker === null ? null : describeProblem(blocker);
    };

    return (
        <div className="launcher-page">
            {/* Profile Grid */}
            <div className="launcher-profile-grid" ref={gridRef} onDragOver={(e) => { e.preventDefault(); setDragPos({ x: e.clientX, y: e.clientY }); }} onDrop={(e) => e.preventDefault()}>
                {allProfiles.map((profile, index) => {
                    const runtimeWarning = getRuntimeWarning(profile);

                    return <div
                        key={profile.uuid}
                        data-uuid={profile.uuid}
                        className={`launcher-profile-card-wrapper${dragUuid === profile.uuid ? " dragging" : ""}`}
                        draggable
                        onDragStart={(e) => {
                            dragUuidRef.current = profile.uuid;
                            e.dataTransfer.setData("text/plain", profile.uuid);
                            e.dataTransfer.effectAllowed = "move";
                            const empty = document.createElement("img");
                            empty.src = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";
                            e.dataTransfer.setDragImage(empty, 0, 0);
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            dragSizeRef.current = { width: rect.width, height: rect.height };
                            setDragPos({ x: e.clientX, y: e.clientY });
                            _setDragUuid(profile.uuid);
                        }}
                        onDragOver={(e) => {
                            e.preventDefault();
                            e.dataTransfer.dropEffect = "move";
                            handleReorder(profile.uuid);
                        }}
                        onDrop={(e) => {
                            e.preventDefault();
                            if (dragUuidRef.current) {
                                log("LauncherPage", `Profile order saved: ${allProfiles.map(p => p.name).join(", ")}`);
                            }
                            setDragUuid(null);
                            saveData();
                        }}
                        onDragEnd={() => {
                            if (dragUuidRef.current) {
                                log("LauncherPage", `Profile order saved: ${allProfiles.map(p => p.name).join(", ")}`);
                            }
                            setDragUuid(null);
                            saveData();
                        }}
                    >
                        <ProfileCard
                            profile={profile}
                            versionName={displayVersion(profile)}
                            runtimeWarning={runtimeWarning}
                            isSelected={lastLaunchedProfileUuid === profile.uuid}
                            canPlay={canLaunch && !runtimeWarning}
                            onEdit={() => {
                                log("LauncherPage", `Opening the editor for "${profile.name}" (${profile.uuid})`);
                                setEditingProfile(index);
                                navigate("/profile-editor");
                            }}
                            onPlay={() => launchGame(profile)}
                            onDelete={() => deleteProfile(index)}
                            onOpenInstallFolder={() => openInstallFolder(profile)}
                            onOpenDataFolder={() => openDataFolder(profile)}
                        />
                    </div>;
                })}
                <div className="launcher-profile-card launcher-create-card" data-uuid="__create__" onClick={async () => {
                    snapshotPositions();
                    try {
                        const result = await createProfileFlow();
                        if (!result) return;
                        navigate(isModded(result.profile) ? "/profile-editor" : "/");
                    } catch (e) {
                        log("LauncherPage", `Profile creation failed: ${describeError(e)}`);
                        setError(`Could not create the profile: ${(e as Error).message ?? e}`);
                    }
                }}>
                    <svg width="24" height="24" viewBox="0 0 20 20" fill="none">
                        <path d="M10 4V16M4 10H16" stroke="#9f9f9f" strokeWidth="2.5" strokeLinecap="square" />
                    </svg>
                    <p className="minecraft-seven launcher-create-card-text">Create a Profile</p>
                </div>
            </div>

            {dragUuid && createPortal(
                (() => {
                    const dragProfile = allProfiles.find(p => p.uuid === dragUuid);
                    if (!dragProfile) return null;
                    return (
                        <div className="launcher-drag-overlay" style={{
                            left: dragPos.x - dragSizeRef.current.width / 2,
                            top: dragPos.y - dragSizeRef.current.height / 2,
                            width: dragSizeRef.current.width,
                            height: dragSizeRef.current.height,
                        }}>
                            <ProfileCard
                                profile={dragProfile}
                                versionName={displayVersion(dragProfile)}
                                runtimeWarning={getRuntimeWarning(dragProfile)}
                                isSelected={lastLaunchedProfileUuid === dragProfile.uuid}
                                canPlay={false}
                                onEdit={() => {}}
                                onPlay={() => {}}
                                onDelete={() => {}}
                                onOpenInstallFolder={() => {}}
                                onOpenDataFolder={() => {}}
                            />
                        </div>
                    );
                })(),
                document.body
            )}
        </div>
    );
}
