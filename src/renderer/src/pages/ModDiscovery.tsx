import { collection, getDocs } from "firebase/firestore";
import { useEffect, useState } from "react";

import { Dropdown } from "@renderer/components/Dropdown";
import { db } from "@renderer/firebase/Firebase";
import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";

import { ModDiscoveryData, SortMode } from "./mod-discovery/ModDiscoveryTypes";
import { ModCard } from "./mod-discovery/ModCard";
import { ModDetailsPopup } from "./mod-discovery/ModDownloads";

export { ModReadme } from "./mod-discovery/ModReadme";

let modsCache: ModDiscoveryData[] | null = null;

export function ModDiscovery() {
    const [searchText, setSearchText] = useState("");
    const [mods, setMods] = useState<ModDiscoveryData[]>(modsCache ?? []);
    const [fetching, setFetching] = useState(!modsCache);
    const [sortMode, setSortMode] = useState<SortMode>("downloads");
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const analyticsConsent = useAppStore(state => state.analyticsConsent);

    useEffect(() => {
        const handleOnline = (): void => setIsOnline(true);
        const handleOffline = (): void => setIsOnline(false);
        window.addEventListener("online", handleOnline);
        window.addEventListener("offline", handleOffline);
        return () => {
            window.removeEventListener("online", handleOnline);
            window.removeEventListener("offline", handleOffline);
        };
    }, []);

    useEffect(() => {
        if (analyticsConsent !== AnalyticsConsent.Accepted) return;
        if (!isOnline) return;
        if (modsCache) return;

        const fetchMods = async () => {
            try {
                const querySnapshot = await getDocs(collection(db, "mods"));
                const modsData = querySnapshot.docs.map(docSnap => ({
                    id: docSnap.id,
                    ...docSnap.data(),
                })) as ModDiscoveryData[];

                modsCache = modsData;
                setMods(modsData);
            } catch (e) {
                console.error("Failed to fetch mods:", e);
            } finally {
                setFetching(false);
            }
        };

        fetchMods();
    }, [analyticsConsent, isOnline]);

    if (analyticsConsent !== AnalyticsConsent.Accepted) {
        return (
            <div className="mod-discovery-page mod-consent-required">
                <div className="mod-no-consent-card">
                    <p className="minecraft-seven mod-no-consent-face">:(</p>
                    <div className="mod-no-consent-text">
                        <p className="minecraft-seven mod-no-consent-title">Analytics disabled</p>
                        <p className="minecraft-seven mod-no-consent-description">
                            Unable to browse community mods. To enable Mod Discovery, open Settings and turn on Analytics Consent.
                        </p>
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

    if (!isOnline) {
        return (
            <div className="mod-discovery-page mod-consent-required">
                <div className="mod-no-consent-card">
                    <p className="minecraft-seven mod-no-consent-face">:(</p>
                    <div className="mod-no-consent-text">
                        <p className="minecraft-seven mod-no-consent-title">No internet connection</p>
                        <p className="minecraft-seven mod-no-consent-description">
                            Unable to browse community mods. Check your internet connection and try again.
                        </p>
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

    const filteredMods = mods
        .filter(mod => mod.name.toLowerCase().includes(searchText.toLowerCase()) && !mod.hidden)
        .sort((a, b) => {
            if (sortMode === "date") return (b.createdAt ?? 0) - (a.createdAt ?? 0);
            return b.downloads - a.downloads;
        });

    return (
        <div className="mod-discovery-page">
            <div className="mod-grid scrollbar">
                <div className="mod-grid-search">
                    <div className="mod-search-row">
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
                                value={searchText}
                                onInput={e => setSearchText(e.currentTarget.value)}
                            />
                        </div>
                        <Dropdown
                            options={[
                                { label: "Downloads", value: "downloads" },
                                { label: "Newest", value: "date" },
                            ]}
                            value={sortMode}
                            setValue={setSortMode as React.Dispatch<React.SetStateAction<string>>}
                        />
                    </div>
                </div>
                {fetching
                    ? Array.from({ length: 8 }).map((_, i) => (
                          <div key={i} className="mod-card mod-card-skeleton">
                              <div className="mod-card-skeleton-icon" />
                              <div className="mod-card-body">
                                  <div
                                      className="mod-card-skeleton-text"
                                      style={{ width: `${60 + (i % 3) * 20}%`, height: "16px" }}
                                  />
                                  <div
                                      className="mod-card-skeleton-text"
                                      style={{ width: `${40 + (i % 2) * 30}%`, height: "13px" }}
                                  />
                              </div>
                              <div className="mod-card-footer">
                                  <div className="mod-card-skeleton-text" style={{ width: "60%", height: "12px" }} />
                                  <div className="mod-card-skeleton-text" style={{ width: "40%", height: "12px" }} />
                              </div>
                          </div>
                      ))
                    : filteredMods.map(mod => (
                          <ModCard
                              key={mod.name}
                              mod={mod}
                              onOpenDetails={() => {
                                  Popup.useAsync<void>(({ submit }) => <ModDetailsPopup mod={mod} onClose={submit} />);
                              }}
                          />
                      ))}
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
