import "@renderer/styles/components/ErrorBanner.css";

import warningIcon from "@renderer/assets/images/icons/warning-icon.png";

import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";

import { clickable } from "@renderer/components/Clickable";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButtonPalette";
import { useAppStore } from "@renderer/states/AppStore";

export function ErrorBanner(): ReactNode | null {
    const error = useAppStore(state => state.error);
    const setError = useAppStore(state => state.setError);
    const navigate = useNavigate();

    if (error === "") return null;

    return (
        <div className="launcher-error-banner" role="alert">
            <div className="launcher-error-body">
                <img src={warningIcon} className="launcher-error-icon pixelated" alt="" />
                <div className="launcher-error-message">
                    <p className="minecraft-seven launcher-error-text">{error}</p>
                    <p className="minecraft-seven launcher-error-hint">
                        A full report was saved to the launcher log. Open Logs and send that file, it holds far more
                        than this message does.
                    </p>
                </div>
            </div>
            <div className="launcher-error-actions">
                <MinecraftButton
                    text="View Logs"
                    colorPallete={GRAY_MINECRAFT_BUTTON}
                    onClick={() => navigate("/logs")}
                    style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "120px" }}
                />
                <div className="launcher-error-close" {...clickable(() => setError(""), { label: "Dismiss error" })}>
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
    );
}
