import { PopupPanel } from "@renderer/components/PopupPanel";
import { MinecraftButton, GRAY_MINECRAFT_BUTTON, RED_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { Popup } from "@renderer/states/PopupStore";

function ConfirmDeletePanel({ title, description, onConfirm, onCancel }: {
    title: string;
    description: string;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <PopupPanel onExit={onCancel} onConfirm={onConfirm}>
            <div className="version-picker confirm-delete-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven confirm-delete-title">{title}</p>
                    <div className="version-popup-close" onClick={onCancel}>
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

                <div className="confirm-delete-body">
                    <p className="minecraft-seven confirm-delete-description">{description}</p>
                </div>

                <div className="version-picker-divider" />

                <div className="version-picker-footer">
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="Cancel" onClick={onCancel} colorPallete={GRAY_MINECRAFT_BUTTON} />
                    </div>
                    <div style={{ flex: 1 }}>
                        <MinecraftButton text="Delete" onClick={onConfirm} colorPallete={RED_MINECRAFT_BUTTON} />
                    </div>
                </div>
            </div>
        </PopupPanel>
    );
}

export async function AskConfirmDelete(title: string, description: string): Promise<boolean> {
    const result = await Popup.useAsync<boolean>(({ submit }) => (
        <ConfirmDeletePanel
            title={title}
            description={description}
            onConfirm={() => submit(true)}
            onCancel={() => submit(false)}
        />
    ));
    return result === true;
}
