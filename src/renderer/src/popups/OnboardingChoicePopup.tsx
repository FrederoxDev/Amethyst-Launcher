import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { MinecraftVersionType } from "@renderer/scripts/VersionDatabase";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export type OnboardingIntent = "import" | "delete";

interface Props extends PopupUseArguments<OnboardingIntent> {
    type: MinecraftVersionType;
    roamingPath: string;
}

export default function OnboardingChoicePopup({ submit, type, roamingPath }: Props) {
    const typeLabel = type === "preview" ? "Minecraft Bedrock Preview" : "Minecraft Bedrock";

    return (
        <PopupPanel
            title={`Existing ${typeLabel} data found`}
            size="md"
            footer={
                <>
                    <MinecraftButton
                        text="Import as profile"
                        onClick={() => submit("import")}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                    <MinecraftButton
                        text="Delete data"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        onClick={() => submit("delete")}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                </>
            }
        >
            <div style={{ display: "flex", flexDirection: "column" }}>
                <p className="minecraft-seven text-input-label">Found data at</p>
                <div className="new-instance-version-field" style={{ cursor: "default" }}>
                    <span className="minecraft-seven" style={{ wordBreak: "break-all" }}>
                        {roamingPath}
                    </span>
                </div>
            </div>
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5 }}>
                Amethyst stores Minecraft data per-profile. Import this data as a new profile, or delete it permanently.
            </p>
        </PopupPanel>
    );
}
