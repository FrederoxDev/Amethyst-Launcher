import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { MinecraftButton, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { AnalyticsConsent } from "@renderer/states/AppStore";
import { Popup } from "@renderer/states/PopupStore";

const { shell } = window.require("electron");

export default function AnalyticsConsentPanel({ accept, decline }: { accept: () => void; decline: () => void }) {
    const animateClose = usePopupClose();
    const onAccept = () => animateClose(accept);
    const onDecline = () => animateClose(decline);

    return (
        <PopupPanel
            title="Analytics Consent"
            onClose={onDecline}
            onConfirm={onAccept}
            size="lg"
            bodyClassName="analytics-consent-body"
            footer={
                <>
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="Decline" onClick={onDecline} colorPallete={RED_MINECRAFT_BUTTON} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="I Agree" onClick={onAccept} />
                    </div>
                </>
            }
            footerAlign="between"
        >
            <p className="minecraft-seven analytics-consent-description">
                Amethyst Launcher collects anonymous usage data to help improve your experience. No personal information
                is ever collected.
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
                    Firebase Privacy &amp; Security
                </a>
            </p>
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
