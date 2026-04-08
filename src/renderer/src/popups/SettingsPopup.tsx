import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { GeneralSettingsTab } from "@renderer/pages/SettingsPage";
import { PopupUseArguments, Popup } from "@renderer/states/PopupStore";
import { DebugInfoPopup } from "./DebugInfoPopup";

const { shell } = window.require("electron");

function LinkIcon() {
    return (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
            <path
                d="M5 2H2C1.44772 2 1 2.44772 1 3V10C1 10.5523 1.44772 11 2 11H9C9.55228 11 10 10.5523 10 10V7"
                stroke="currentColor"
                strokeWidth="1.3"
                strokeLinecap="square"
            />
            <path d="M7 1H11M11 1V5M11 1L5.5 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="square" />
        </svg>
    );
}

export function SettingsPopup({ submit: rawSubmit }: PopupUseArguments<void>) {
    const animateClose = usePopupClose();
    const submit = () => animateClose(() => rawSubmit());

    return (
        <PopupPanel onExit={submit}>
            <div className="version-picker settings-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>
                        Settings
                    </p>
                    <div className="version-popup-close" onClick={submit}>
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
                <div className="settings-popup-body scrollbar">
                    <GeneralSettingsTab />
                    <div className="version-picker-divider" />
                    <div className="settings-popup-footer">
                        <div className="settings-footer-links">
                            <div
                                className="minecraft-seven settings-footer-link"
                                onClick={() => shell.openExternal("https://discord.gg/HscUFVVwwQ")}
                            >
                                <LinkIcon />
                                <span>Discord</span>
                            </div>
                            <div
                                className="minecraft-seven settings-footer-link"
                                onClick={() => shell.openExternal("https://github.com/FrederoxDev/Amethyst-Launcher")}
                            >
                                <LinkIcon />
                                <span>GitHub</span>
                            </div>
                            <div
                                className="minecraft-seven settings-footer-link"
                                onClick={() => Popup.useAsync<void>(props => <DebugInfoPopup {...props} />)}
                            >
                                <LinkIcon />
                                <span>Debug Info</span>
                            </div>
                        </div>
                        <p className="minecraft-seven settings-copyright">© 2026 Amethyst Team — All rights reserved.</p>
                    </div>
                </div>
            </div>
        </PopupPanel>
    );
}

