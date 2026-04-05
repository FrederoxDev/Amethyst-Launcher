import { PopupPanel } from "@renderer/components/PopupPanel";
import { MinecraftButton, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { AnalyticsConsent } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";

const { shell } = window.require("electron");

export default function AnalyticsConsentPanel({ accept, decline }: { accept: () => void; decline: () => void }) {
    return (
        <PopupPanel onExit={decline} onConfirm={accept}>
            <div className="version-picker analytics-consent-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven analytics-consent-title">Analytics Consent</p>
                    <div className="version-popup-close" onClick={decline}>
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

                <div className="analytics-consent-body">
                    <p className="minecraft-seven analytics-consent-description">
                        Amethyst Launcher collects anonymous usage data to help improve your experience. No personal
                        information is ever collected.
                    </p>

                    <div className="analytics-consent-items">
                        {[
                            "App interactions — mod downloads, button clicks",
                            "Device info — device type, OS version",
                            "Session and engagement data",
                        ].map(item => (
                            <div key={item} className="analytics-consent-item">
                                <span className="analytics-consent-dot" />
                                <p className="minecraft-seven">{item}</p>
                            </div>
                        ))}
                    </div>

                    <p className="minecraft-seven analytics-consent-note">
                        Consent can be revoked at any time in Settings.{" "}
                        <a
                            className="analytics-consent-link"
                            onClick={e => {
                                e.preventDefault();
                                shell.openExternal("https://firebase.google.com/support/privacy");
                            }}
                        >
                            Firebase Privacy & Security
                        </a>
                    </p>
                </div>

                <div className="version-picker-divider" />

                <div className="version-picker-footer">
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="Decline" onClick={decline} colorPallete={RED_MINECRAFT_BUTTON} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="I Agree" onClick={accept} />
                    </div>
                </div>
            </div>
        </PopupPanel>
    );
}

export async function AskAnalyticsConsent() {
    return await Popup.useAsync<AnalyticsConsent>(({ submit }) => (
        <AnalyticsConsentPanel
            accept={() => submit(AnalyticsConsent.Accepted)}
            decline={() => submit(AnalyticsConsent.Declined)}
        />
    ));
}

