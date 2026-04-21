import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { Popup } from "@renderer/states/PopupStore";

interface ConfirmOptions {
    title: string;
    message: string;
    confirmText?: string;
    cancelText?: string;
}

export function confirmAction(options: ConfirmOptions): Promise<boolean> {
    const { title, message, confirmText = "Confirm", cancelText = "Cancel" } = options;
    return Popup.useAsync<boolean>(({ submit }) => (
        <PopupPanel onExit={() => submit(false)}>
            <div className="version-picker" style={{ width: 380 }} onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>{title}</p>
                    <div className="version-popup-close" onClick={() => submit(false)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="12 1.01818182 10.9818182 0 6 4.98181818 1.01818182 0 0 1.01818182 4.98181818 6 0 10.9818182 1.01818182 12 6 7.01818182 10.9818182 12 12 10.9818182 7.01818182 6" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div style={{ padding: "12px 16px" }}>
                    <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>{message}</p>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-footer" style={{ justifyContent: "flex-start", gap: 8 }}>
                    <MinecraftButton text={confirmText} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }} onClick={() => submit(true)} />
                    <MinecraftButton text={cancelText} colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "120px" }} onClick={() => submit(false)} />
                </div>
            </div>
        </PopupPanel>
    ));
}
