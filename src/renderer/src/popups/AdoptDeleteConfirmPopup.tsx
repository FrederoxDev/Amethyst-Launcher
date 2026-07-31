import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { ReadOnlyTextBox } from "@renderer/components/ReadOnlyTextBox";
import { PopupUseArguments } from "@renderer/states/PopupStore";

interface Props extends PopupUseArguments<boolean> {
    dataPath: string;
}

export default function AdoptDeleteConfirmPopup({ submit, dataPath }: Props) {
    return (
        <PopupPanel
            title="Delete this data permanently?"
            size="md"
            footer={
                <>
                    <MinecraftButton text="Cancel" onClick={() => submit(false)} style={{ flex: 1, minWidth: 0 }} />
                    <MinecraftButton
                        text="Delete forever"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        onClick={() => submit(true)}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                </>
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5 }}>
                Worlds, resource packs and settings in this folder will be gone for good. This cannot be undone.
            </p>
            <ReadOnlyTextBox label="Deleting" text={dataPath} />
        </PopupPanel>
    );
}
