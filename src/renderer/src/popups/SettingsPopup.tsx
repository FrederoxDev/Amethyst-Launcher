import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { GeneralSettingsTab } from "@renderer/pages/SettingsPage";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export function SettingsPopup({ submit: rawSubmit }: PopupUseArguments<void>) {
    const animateClose = usePopupClose();
    const submit = () => animateClose(() => rawSubmit());

    return (
        <PopupPanel onExit={submit}>
            <div className="version-picker settings-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>Settings</p>
                    <div className="version-popup-close" onClick={submit}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div className="settings-popup-body scrollbar">
                    <GeneralSettingsTab />
                </div>
            </div>
        </PopupPanel>
    );
}
