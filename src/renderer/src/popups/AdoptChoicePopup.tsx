import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { ReadOnlyTextBox } from "@renderer/components/ReadOnlyTextBox";
import { Channel, channelLabel } from "@renderer/scripts/domain/Channel";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export type AdoptIntent = "adopt" | "delete";

interface Props extends PopupUseArguments<AdoptIntent> {
    channel: Channel;
    dataPath: string;
}

export default function AdoptChoicePopup({ submit, channel, dataPath }: Props) {
    const gameName = channel === "preview" ? "Minecraft Bedrock Preview" : "Minecraft Bedrock";

    return (
        <PopupPanel
            title={`Existing ${gameName} data found`}
            size="md"
            footer={
                <>
                    <MinecraftButton text="Keep as a profile" onClick={() => submit("adopt")} style={{ flex: 1, minWidth: 0 }} />
                    <MinecraftButton
                        text="Delete data"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        onClick={() => submit("delete")}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                </>
            }
        >
            <ReadOnlyTextBox label="Found data at" text={dataPath} />
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5 }}>
                Amethyst keeps game data per profile. Turn this data into a new {channelLabel(channel)} profile,
                or delete it permanently.
            </p>
        </PopupPanel>
    );
}
