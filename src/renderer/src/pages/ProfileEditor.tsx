import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";

import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButtonPalette";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { usePopupClose } from "@renderer/components/PopupCloseContext";
import { TextInput } from "@renderer/components/TextInput";
import { Popup, PopupUseArguments } from "@renderer/states/PopupStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { useAppStore } from "@renderer/states/AppStore";
import {
  VersionChoice,
  VersionPickerPopup,
} from "@renderer/popups/VersionPickerPopup";
import {
  launchErrorMessage,
  launchProfile as doLaunchProfile,
} from "@renderer/flows/Launch";
import {
  confirmProfileDeletion,
  deleteProfile as removeProfile,
  openDataFolder,
  openInstallFolder,
} from "@renderer/flows/ProfileActions";
import { startPendingImport } from "@renderer/flows/VersionChoice";
import { Channel, channelLabel } from "@renderer/scripts/domain/Channel";
import {
  describeProblem,
  diagnoseProfile,
  launchBlocker,
  problemFor,
} from "@renderer/scripts/domain/ProfileDiagnosis";
import { toModStatus } from "@renderer/scripts/Mods";
import { MOD_DISCOVERY_ENABLED } from "@renderer/scripts/FeatureFlags";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron") as typeof import("electron");

const AUTOSAVE_DELAY_MS = 400;

/**
 * One stat per mod per folder scan. Resolving on render meant a stat per mod row per keystroke of
 * the search box, on the renderer thread.
 */
function useModIcons(modsPath: string): Map<string, string> {
  const allMods = useAppStore((state) => state.allMods);
  return useMemo(() => {
    const icons = new Map<string, string>();
    for (const mod of allMods) {
      const iconPath = path.join(
        modsPath,
        mod.id,
        "resource_packs",
        "main_rp",
        "pack_icon.png",
      );
      if (fs.existsSync(iconPath))
        icons.set(
          mod.id,
          `amethyst-icon://icon/${encodeURIComponent(iconPath)}`,
        );
    }
    return icons;
  }, [allMods, modsPath]);
}

function ModIcon({ iconUrl }: { iconUrl: string | undefined }) {
  return (
    <div className="profile-editor-mod-icon">
      {iconUrl ? (
        <img
          src={iconUrl}
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
      )}
    </div>
  );
}

function AddContentPopup({
  submit: rawSubmit,
}: PopupUseArguments<string | "browse" | null>) {
  const animateClose = usePopupClose();
  const submit = (val: string | "browse" | null) =>
    animateClose(() => rawSubmit(val));
  const mods = useAppStore((state) => state.allValidMods);
  const setError = useAppStore((state) => state.setError);
  const editingProfileUuid = useAppStore((state) => state.editingProfileUuid);
  const profiles = useAppStore((state) => state.profiles);
  const activeMods = useMemo(
    () =>
      profiles.find((profile) => profile.uuid === editingProfileUuid)?.mods ??
      [],
    [profiles, editingProfileUuid],
  );
  const modsPath = useMemo(
    () => useAppStore.getState().platform.getPaths().modsPath,
    [],
  );
  const modIcons = useModIcons(modsPath);
  const availableMods = useMemo(
    () => mods.filter((m) => !activeMods.includes(m)),
    [mods, activeMods],
  );
  const [search, setSearch] = useState("");
  const filtered = useMemo(() => {
    if (!search) return availableMods;
    const q = search.toLowerCase();
    return availableMods.filter((m) => m.toLowerCase().includes(q));
  }, [availableMods, search]);

  return (
    <PopupPanel
      title="Add Content"
      onClose={() => submit(null)}
      size="md"
      bodyClassName="popup-body--flush"
      footerAlign="start"
      footer={
        <>
          {MOD_DISCOVERY_ENABLED && (
            <MinecraftButton
              text="Browse Mods"
              style={{
                "--mc-button-container-h": "32px",
                "--mc-button-container-w": "140px",
              }}
              onClick={() => submit("browse")}
            />
          )}
          <MinecraftButton
            text="Open Mods Folder"
            colorPallete={GRAY_MINECRAFT_BUTTON}
            style={{
              "--mc-button-container-h": "32px",
              "--mc-button-container-w": "160px",
            }}
            onClick={async () => {
              try {
                if (!fs.existsSync(modsPath)) {
                  log(
                    "ProfileEditor",
                    `Creating the mods folder ${modsPath} before opening it`,
                  );
                  fs.mkdirSync(modsPath, { recursive: true });
                }

                const openError = await shell.openPath(modsPath);
                if (openError) {
                  log(
                    "ProfileEditor",
                    `Could not open ${modsPath}: ${openError}`,
                  );
                  setError(`Failed to open mods folder: ${openError}`);
                } else {
                  log("ProfileEditor", `Opened the mods folder ${modsPath}`);
                }
              } catch (e) {
                log(
                  "ProfileEditor",
                  `Could not open ${modsPath}: ${describeError(e)}`,
                );
                setError(`Failed to open mods folder: ${userMessage(e)}`);
              }
            }}
          />
        </>
      }
    >
      <div style={{ padding: "8px", flexShrink: 0 }}>
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
            placeholder="Search local mods..."
            value={search}
            onInput={(e) => setSearch(e.currentTarget.value)}
          />
        </div>
      </div>
      <div className="version-picker-list scrollbar">
        {filtered.length === 0 && (
          <p
            className="minecraft-seven"
            style={{ color: "#9f9f9f", padding: "12px", textAlign: "center" }}
          >
            {search ? "No mods match your search." : "No local mods available."}
          </p>
        )}
        {filtered.map((mod) => (
          <div
            key={mod}
            className="version-picker-item"
            style={{
              justifyContent: "flex-start",
              gap: 10,
              padding: "4px 6px",
            }}
            onClick={() => submit(mod)}
          >
            <ModIcon iconUrl={modIcons.get(mod)} />
            <p className="minecraft-seven">{mod}</p>
          </div>
        ))}
      </div>
    </PopupPanel>
  );
}

export function ProfileEditor() {
  const [profileName, setProfileName] = useState("");
  const [profileActiveMods, setProfileActiveMods] = useState<string[]>([]);
  const [profileModded, setProfileModded] = useState(false);
  const [profileVersionLabel, setProfileVersionLabel] = useState<string>("");
  const [profileVersionUuid, setProfileVersionUuid] = useState<string>("");
  const [profileChannel, setProfileChannel] = useState<Channel>("release");
  const [modSearch, setModSearch] = useState("");
  const [loadedProfileUuid, setLoadedProfileUuid] = useState<string | null>(
    null,
  );

  // Subscribe to ProgressBar so the Play button greys out reactively when
  // long-running ops (launch, import, delete, uninstall) are in progress.
  const canLaunch = ProgressBar.useCanDoAction("launch");

  const [showMenu, setShowMenu] = useState(false);
  const dotsRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, right: 0 });
  const allProfiles = useAppStore((state) => state.profiles);
  const editingProfileUuid = useAppStore((state) => state.editingProfileUuid);
  const downloadingMods = useAppStore((state) => state.downloadingMods);
  const allMods = useAppStore((state) => state.allMods);
  const installedVersions = useAppStore((state) => state.installedVersions);
  const navigate = useNavigate();

  useEffect(() => {
    if (allProfiles.length === 0) {
      navigate("/profiles");
    }
  }, [allProfiles, navigate]);

  const platform = useAppStore((state) => state.platform);
  const modsPath = useMemo(() => platform.getPaths().modsPath, [platform]);
  const modIcons = useModIcons(modsPath);

  const editingProfile = allProfiles.find(
    (profile) => profile.uuid === editingProfileUuid,
  );

  // Keyed on which profile is open, not on the profiles array: a save of our own must not read
  // itself back over a keystroke the user made since.
  if (loadedProfileUuid !== editingProfileUuid) {
    if (!editingProfile)
      log(
        "ProfileEditor",
        `No profile with uuid ${editingProfileUuid}; the editor is opening on an empty profile`,
      );
    setLoadedProfileUuid(editingProfileUuid);
    setProfileName(editingProfile?.name ?? "New Profile");
    setProfileModded(editingProfile?.modded ?? false);
    setProfileActiveMods(editingProfile?.mods ?? []);
    setProfileVersionLabel(editingProfile?.versionLabel ?? "");
    setProfileVersionUuid(editingProfile?.versionUuid ?? "");
    setProfileChannel(editingProfile?.channel ?? "release");
  }

  /**
   * Typing is not an edit until it stops, and the store is the only writer: mutating the Profile
   * objects in place left every subscriber on an unchanged reference.
   */
  const pendingSave = useRef<(() => void) | null>(null);

  /** Adding a mod is itself the Modded choice; nothing else on this page makes it. */
  const profileIsModded = profileModded || profileActiveMods.length > 0;

  useEffect(() => {
    if (loadedProfileUuid !== editingProfileUuid) return undefined;

    const commit = () => {
      pendingSave.current = null;
      const state = useAppStore.getState();
      const stored = state.profiles.find(
        (profile) => profile.uuid === editingProfileUuid,
      );
      if (!stored) {
        log(
          "ProfileEditor",
          `Autosave skipped: no profile with uuid ${editingProfileUuid}`,
        );
        return;
      }

      // Opening the page is not an edit, and profiles.json is rewritten whole.
      const unchanged =
        stored.name === profileName &&
        stored.modded === profileIsModded &&
        stored.versionLabel === profileVersionLabel &&
        stored.versionUuid === profileVersionUuid &&
        stored.channel === profileChannel &&
        stored.mods.length === profileActiveMods.length &&
        stored.mods.every((mod, index) => mod === profileActiveMods[index]);
      if (unchanged) return;

      state.setProfiles((profiles) =>
        profiles.map((profile) =>
          profile.uuid !== editingProfileUuid
            ? profile
            : {
                ...profile,
                name: profileName,
                modded: profileIsModded,
                mods: profileActiveMods,
                versionLabel: profileVersionLabel,
                versionUuid: profileVersionUuid,
                channel: profileChannel,
              },
        ),
      );
      state.saveData();
    };

    pendingSave.current = commit;
    const timer = setTimeout(commit, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    loadedProfileUuid,
    editingProfileUuid,
    profileName,
    profileIsModded,
    profileActiveMods,
    profileVersionLabel,
    profileVersionUuid,
    profileChannel,
  ]);

  /** Leaving the page is the end of typing, so the edit still in the debounce window is written. */
  useEffect(() => () => pendingSave.current?.(), []);

  /**
   * The mod browser installs into whichever profile it was opened from, so that target lives only
   * for as long as this page hands over to it. Left set, the next install from the navbar silently
   * attaches to a profile the user closed.
   */
  const handingOverToBrowse = useRef(false);

  useEffect(() => {
    useAppStore.getState().setInstallingForProfile(null);
    return () => {
      if (handingOverToBrowse.current) return;
      useAppStore.getState().setInstallingForProfile(null);
    };
  }, []);

  const getOrphanedMods = (
    modNames: string[],
    excludeProfileUuid: string | null,
  ) => {
    return modNames.filter((modName) => {
      if (modName.includes("0.0.0-dev")) return false;
      const otherProfilesUsingMod = allProfiles.filter(
        (p) => p.uuid !== excludeProfileUuid && p.mods.includes(modName),
      );
      return otherProfilesUsingMod.length === 0;
    });
  };

  const promptDeleteOrphanedMods = async (
    orphanedMods: string[],
  ): Promise<boolean> => {
    if (orphanedMods.length === 0) return true;

    const result = await Popup.ask<"delete" | "keep" | null>(({ submit }) => (
      <PopupPanel
        title="Delete Mods?"
        onClose={() => submit(null)}
        size="sm"
        footerAlign="start"
        footer={
          <>
            <MinecraftButton
              text="Delete from Disk"
              style={{
                "--mc-button-container-h": "32px",
                "--mc-button-container-w": "160px",
              }}
              onClick={() => submit("delete")}
            />
            <MinecraftButton
              text="Keep Files"
              colorPallete={GRAY_MINECRAFT_BUTTON}
              style={{
                "--mc-button-container-h": "32px",
                "--mc-button-container-w": "120px",
              }}
              onClick={() => submit("keep")}
            />
          </>
        }
      >
        <p
          className="minecraft-seven"
          style={{ color: "#9f9f9f", fontSize: "12px" }}
        >
          {orphanedMods.length === 1
            ? "This mod is not used by any other profile:"
            : "These mods are not used by any other profile:"}
        </p>
        {orphanedMods.map((name) => (
          <p
            key={name}
            className="minecraft-seven"
            style={{ color: "white", fontSize: "13px", padding: "2px 0" }}
          >
            {name}
          </p>
        ))}
      </PopupPanel>
    ));

    if (result === null) {
      log(
        "ProfileEditor",
        `Cancelled at the orphaned-mod prompt for ${orphanedMods.join(", ")}`,
      );
      return false; // cancelled
    }
    if (result === "delete") {
      log(
        "ProfileEditor",
        `Deleting orphaned mod folders from disk: ${orphanedMods.join(", ")}`,
      );
      await Promise.all(
        orphanedMods.map(async (modName) => {
          const modPath = path.join(modsPath, modName);
          try {
            await fs.promises.rm(modPath, { recursive: true, force: true });
            log("ProfileEditor", `Deleted ${modPath}`);
          } catch (e) {
            log(
              "ProfileEditor",
              `Could not delete ${modPath}: ${describeError(e)}`,
            );
            throw e;
          }
        }),
      );
    } else {
      log(
        "ProfileEditor",
        `Keeping the files of ${orphanedMods.join(", ")} on disk`,
      );
    }
    return true;
  };

  const removeMod = async (modName: string) => {
    const orphaned = getOrphanedMods([modName], editingProfileUuid);
    const proceed = await promptDeleteOrphanedMods(orphaned);
    if (!proceed) return;
    log(
      "ProfileEditor",
      `Removed mod "${modName}" from profile "${editingProfile?.name ?? editingProfileUuid}"`,
    );
    setProfileActiveMods(profileActiveMods.filter((m) => m !== modName));
    useAppStore.getState().refreshAllMods();
  };

  const deleteProfile = async () => {
    const profile = editingProfile;
    if (!profile) {
      log(
        "ProfileEditor",
        `Delete ignored: no profile with uuid ${editingProfileUuid}`,
      );
      return;
    }

    if (!(await confirmProfileDeletion(profile))) return;

    const orphaned = getOrphanedMods(profile.mods, editingProfileUuid);
    const proceed = await promptDeleteOrphanedMods(orphaned);
    if (!proceed) {
      log(
        "ProfileEditor",
        `Deletion of "${profile.name}" stopped at the orphaned-mod prompt`,
      );
      return;
    }

    try {
      await removeProfile(profile);
    } catch (e) {
      log(
        "ProfileEditor",
        `Deleting "${profile.name}" failed: ${describeError(e)}`,
      );
      useAppStore
        .getState()
        .setError(`Could not delete ${profile.name}: ${userMessage(e)}`);
      return;
    }
    navigate("/");
  };

  const onPlay = async () => {
    const profile = editingProfile;
    if (!profile) {
      log(
        "ProfileEditor",
        `Play ignored: no profile with uuid ${editingProfileUuid}`,
      );
      useAppStore
        .getState()
        .setError(
          "That profile is no longer open, so it could not be started.\n\n" +
            "Go back to the launcher, pick a profile and press Play.",
        );
      return;
    }

    log("ProfileEditor", `Play pressed on "${profile.name}" (${profile.uuid})`);
    try {
      await doLaunchProfile(profile);
    } catch (e) {
      log(
        "ProfileEditor",
        `Launch of "${profile.name}" ended in an error shown to the user: ${describeError(e)}`,
      );
      useAppStore.getState().setError(launchErrorMessage(e));
      ProgressBar.reset();
    }
  };

  // Close menu on outside click
  useEffect(() => {
    if (!showMenu) return;
    const handleClick = (e: MouseEvent) => {
      if (
        dotsRef.current &&
        !dotsRef.current.contains(e.target as Node) &&
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
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

  const openAddContent = async () => {
    useAppStore.getState().refreshAllMods();

    const result = await Popup.ask<string | "browse" | null>((props) => {
      return <AddContentPopup {...props} />;
    });

    if (result === null) {
      log("ProfileEditor", "Add Content closed without a choice");
      return;
    }
    if (result === "browse") {
      if (!editingProfileUuid) {
        log("ProfileEditor", "Browse ignored: the editor has no profile open");
        return;
      }
      log("ProfileEditor", `Browsing mods for profile ${editingProfileUuid}`);
      handingOverToBrowse.current = true;
      useAppStore.getState().setInstallingForProfile(editingProfileUuid);
      navigate("/mod-discovery");
      return;
    }
    if (profileActiveMods.includes(result)) {
      log(
        "ProfileEditor",
        `Mod "${result}" not added: the profile already lists it`,
      );
      return;
    }
    log(
      "ProfileEditor",
      `Added mod "${result}" to profile "${editingProfile?.name ?? editingProfileUuid}"`,
    );
    setProfileActiveMods([...profileActiveMods, result]);
  };

  const openVersionPicker = async () => {
    const choice = await Popup.ask<VersionChoice | null>((props) => (
      <VersionPickerPopup {...props} />
    ));
    if (!choice) {
      log("ProfileEditor", "Version picker closed without a choice");
      return;
    }
    log(
      "ProfileEditor",
      `Version for "${editingProfile?.name ?? editingProfileUuid}": ` +
        `"${profileVersionLabel || "unset"}" (${profileVersionUuid || "unset"}, ${profileChannel}) -> ` +
        `"${choice.label}" (${choice.versionUuid}, ${choice.channel})`,
    );
    startPendingImport(choice);
    setProfileVersionLabel(choice.label);
    setProfileVersionUuid(choice.versionUuid);
    setProfileChannel(choice.channel);
  };

  const versionDisplayName = useMemo(() => {
    const installed = installedVersions.find(
      (v) => v.uuid === profileVersionUuid,
    );
    return installed?.label ?? profileVersionLabel ?? "Select version...";
  }, [profileVersionUuid, profileVersionLabel, installedVersions]);

  /**
   * Everything wrong with this profile, from the one place that decides it. Scoped to the
   * profile: the mods folder may hold other broken mods, and they are the Mod Manager's
   * business rather than a number on this page that matches nothing the user can see.
   */
  const modStatuses = useMemo(() => toModStatus(allMods), [allMods]);

  const profileProblems = useMemo(
    () =>
      diagnoseProfile({
        modded: profileIsModded,
        modIds: profileActiveMods,
        mods: modStatuses,
        downloading: downloadingMods,
      }),
    [profileActiveMods, profileIsModded, modStatuses, downloadingMods],
  );

  const allModsList = useMemo(() => {
    const runtimeSet = new Set(
      modStatuses.filter((mod) => mod.isRuntime).map((mod) => mod.id),
    );

    // Its own problem, not a bare red name. "Not in the mods folder" and "here but cannot be
    // loaded, because ..." are different faults with different fixes, and the row is the one
    // place the user is already looking when they want to know which of the two this is.
    const modsWithMeta = profileActiveMods.map((name) => ({
      name,
      isDownloading: downloadingMods.includes(name),
      problem: problemFor(profileProblems, name),
    }));

    // A rejected runtime is not recognisable as a runtime any more, so ordering by the runtime
    // set alone dropped the mod the banner names to the bottom of the list. The diagnosis says
    // which mods the banner is about, and those belong next to the runtimes it stands in for.
    const rank = (mod: (typeof modsWithMeta)[number]) =>
      runtimeSet.has(mod.name) ? 0 : mod.problem !== null ? 1 : 2;

    return [...modsWithMeta].sort((a, b) => rank(a) - rank(b));
  }, [profileActiveMods, downloadingMods, modStatuses, profileProblems]);

  const filteredModsList = useMemo(() => {
    if (!modSearch) return allModsList;
    const q = modSearch.toLowerCase();
    return allModsList.filter((mod) => mod.name.toLowerCase().includes(q));
  }, [allModsList, modSearch]);

  const runtimeWarning = useMemo(() => {
    const blocker = launchBlocker(profileProblems);
    return blocker === null ? null : describeProblem(blocker);
  }, [profileProblems]);

  return (
    <div className="profile-editor-page">
      {profileProblems.length > 0 && (
        <div className="profile-editor-invalid-mods">
          {profileProblems.map((problem, index) => (
            <p
              className="minecraft-seven"
              key={`${problem.kind}:${problem.modId ?? index}`}
            >
              {describeProblem(problem)}
            </p>
          ))}
        </div>
      )}

      <div className="profile-editor-mod-section">
        <div className="profile-editor-mod-header">
          <div className="profile-editor-header-left">
            <div className="profile-editor-header-fields">
              <TextInput
                label="Profile Name"
                text={profileName}
                setText={setProfileName}
              />
              <div className="profile-editor-field">
                <p
                  className="minecraft-seven text-input-label"
                  style={{ paddingBottom: 2 }}
                >
                  Minecraft Version
                </p>
                <div
                  className="profile-editor-version-btn"
                  onClick={openVersionPicker}
                >
                  <p className="minecraft-seven">
                    {versionDisplayName}
                    <span
                      className="minecraft-seven version-picker-item-tag"
                      style={{ marginLeft: 8 }}
                    >
                      {channelLabel(profileChannel)}
                    </span>
                  </p>
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
                onInput={(e) => setModSearch(e.currentTarget.value)}
              />
            </div>
          </div>
          <div className="profile-editor-header-right">
            <div className="profile-editor-name-actions">
              <div className="profile-editor-play-wrap">
                <div className="launcher-profile-card-play">
                  <MinecraftButton
                    text="Play"
                    onClick={onPlay}
                    disabled={!!runtimeWarning || !canLaunch}
                    style={{ "--mc-button-container-h": "36px" }}
                  />
                </div>
                {runtimeWarning && (
                  <div className="profile-editor-play-warning-tooltip minecraft-seven">
                    {runtimeWarning}
                  </div>
                )}
              </div>
              <div
                className="launcher-profile-card-menu"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="launcher-profile-card-dots"
                  ref={dotsRef}
                  onClick={() => setShowMenu(!showMenu)}
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="3" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="8" r="1.5" fill="#FFFFFF" />
                    <circle cx="8" cy="13" r="1.5" fill="#FFFFFF" />
                  </svg>
                </div>
                {showMenu &&
                  createPortal(
                    <div
                      className="launcher-profile-card-dropdown"
                      ref={dropdownRef}
                      style={{ top: dropdownPos.top, right: dropdownPos.right }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div
                        className="launcher-profile-card-dropdown-item"
                        onClick={() => {
                          if (editingProfile) openDataFolder(editingProfile);
                          setShowMenu(false);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z"
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                          />
                        </svg>
                        <p className="minecraft-seven">Open Data Folder</p>
                      </div>
                      <div
                        className="launcher-profile-card-dropdown-item"
                        onClick={() => {
                          if (editingProfile) openInstallFolder(editingProfile);
                          setShowMenu(false);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M1 3C1 2.44772 1.44772 2 2 2H6.17157C6.43679 2 6.69114 2.10536 6.87868 2.29289L7.70711 3.12132C7.89464 3.30886 8.149 3.41421 8.41421 3.41421H14C14.5523 3.41421 15 3.86193 15 4.41421V13C15 13.5523 14.5523 14 14 14H2C1.44772 14 1 13.5523 1 13V3Z"
                            stroke="#FFFFFF"
                            strokeWidth="1.5"
                          />
                        </svg>
                        <p className="minecraft-seven">Open Install Folder</p>
                      </div>
                      <div
                        className="launcher-profile-card-dropdown-item launcher-profile-card-dropdown-item--danger"
                        onClick={() => {
                          deleteProfile();
                          setShowMenu(false);
                        }}
                      >
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 16 16"
                          fill="none"
                        >
                          <path
                            d="M2 4H14M5.5 4V2.5C5.5 2.22386 5.72386 2 6 2H10C10.2761 2 10.5 2.22386 10.5 2.5V4M6.5 7V11.5M9.5 7V11.5M3.5 4L4.25 13.5C4.25 13.7761 4.47386 14 4.75 14H11.25C11.5261 14 11.75 13.7761 11.75 13.5L12.5 4"
                            stroke="currentColor"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                        <p className="minecraft-seven">Delete Profile</p>
                      </div>
                    </div>,
                    document.body,
                  )}
              </div>
            </div>
            <MinecraftButton
              text="Add Content"
              onClick={openAddContent}
              colorPallete={GRAY_MINECRAFT_BUTTON}
              style={{
                "--mc-button-container-h": "34px",
                "--mc-button-container-w": "100%",
              }}
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
          {filteredModsList.map((mod) => (
            <div key={mod.name} className="profile-editor-mod-row">
              <ModIcon iconUrl={modIcons.get(mod.name)} />
              <div className="profile-editor-mod-row-info">
                <p
                  className={`minecraft-seven ${mod.problem ? "profile-editor-mod-missing" : ""}`}
                >
                  {mod.name}
                </p>
                {mod.isDownloading && (
                  <span className="minecraft-seven profile-editor-mod-downloading">
                    Downloading...
                  </span>
                )}
                {mod.problem && (
                  <span className="minecraft-seven profile-editor-mod-problem">
                    {mod.problem.reasons.length > 0
                      ? mod.problem.reasons.join(" ")
                      : mod.problem.headline}
                  </span>
                )}
              </div>
              <div
                className="profile-editor-mod-delete"
                onClick={() => removeMod(mod.name)}
              >
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
