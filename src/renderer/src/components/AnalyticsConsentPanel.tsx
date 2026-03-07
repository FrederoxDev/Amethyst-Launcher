import { AnalyticsConsent, useAppStore } from "@renderer/states/AppStore";
import { MainPanel, MainPanelSection, PanelIndent } from "./MainPanel";
import { MinecraftButton } from "./MinecraftButton";
import { MinecraftButtonStyle } from "./MinecraftButtonStyle";
import { PopupPanel } from "./PopupPanel";
import { Popup } from "@renderer/states/PopupStore";

const { shell } = window.require("electron");

export default function AnalyticsConsentPanel({ accept, decline }: { accept: () => void, decline: () => void }) {
    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <p>Analytics Consent</p>
                        <PanelIndent className="app-consent-indent">
                            <p>
                                Amethyst Launcher uses Firebase Analytics to collect anonymized usage data to help
                                improve the launcher. The data collected may include:
                            </p>
                            <ul>
                                <p> - App interactions (e.g., mod downloads, button clicks)</p>
                                <p> - Device information (device type, OS version)</p>
                                <p> - Session and engagement data</p>
                            </ul>
                            <p>No personal information (like names or emails) is collected.</p>
                            <p>
                                By clicking “I Agree”, you consent to this data collection. You can later revoke consent
                                in the launcher settings.
                            </p>
                            <p>
                                For more details, see{" "}
                                <a
                                    href="https://firebase.google.com/support/privacy"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="app-consent-link"
                                    onClick={e => {
                                        e.preventDefault();
                                        shell.openExternal("https://firebase.google.com/support/privacy");
                                    }}
                                >
                                    Firebase Privacy & Security
                                </a>
                                .
                            </p>
                        </PanelIndent>
                        <div className="app-consent-actions">
                            <MinecraftButton
                                text="I Agree"
                                onClick={() => accept()}
                            />
                            <MinecraftButton
                                text="Decline"
                                onClick={() => decline()}
                                style={MinecraftButtonStyle.Warn}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}

export async function AskAnalyticsConsent() {
    const currentConsent = useAppStore.getState().analyticsConsent;
    console.log("Checking analytics consent, current value:", currentConsent);
    console.log("Asking user for analytics consent...");
    const result = await Popup.useAsync<AnalyticsConsent>(({ submit }) => {
        return <AnalyticsConsentPanel 
            accept={() => {
                submit(AnalyticsConsent.Accepted);
            }}
            decline={() => {
                submit(AnalyticsConsent.Declined);
            }}
        />;
    });
    console.log("User submitted popup, user analytics consent result:", result);
    return result;
}