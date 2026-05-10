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
        <PopupPanel
            title={title}
            onClose={() => submit(false)}
            size="sm"
            footerAlign="start"
            footer={
                <>
                    <MinecraftButton text={confirmText} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "160px" }} onClick={() => submit(true)} />
                    <MinecraftButton text={cancelText} colorPallete={GRAY_MINECRAFT_BUTTON} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "120px" }} onClick={() => submit(false)} />
                </>
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>{message}</p>
        </PopupPanel>
    ));
}
