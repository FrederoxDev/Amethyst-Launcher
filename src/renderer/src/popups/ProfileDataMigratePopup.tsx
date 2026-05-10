import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";

export type MigrateChoice = "migrate" | "fresh" | "cancel";

export default function ProfileDataMigratePopup({ profileName, roamingPath, onChoose }: {
    profileName: string;
    roamingPath: string;
    onChoose: (choice: MigrateChoice) => void;
}) {
    return (
        <PopupPanel
            title="Existing Minecraft data found"
            size="lg"
            footer={
                <>
                    <MinecraftButton
                        text={`Migrate into "${profileName}"`}
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => onChoose("migrate")}
                    />
                    <MinecraftButton
                        text="Back up & start fresh"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => onChoose("fresh")}
                    />
                    <MinecraftButton
                        text="Cancel launch"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        style={{ flex: 1, minWidth: 0 }}
                        onClick={() => onChoose("cancel")}
                    />
                </>
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                Amethyst is switching to per-profile data folders. Existing Minecraft data was found at:
            </p>
            <p className="minecraft-seven" style={{ fontSize: "12px", color: "#9f9f9f", wordBreak: "break-all" }}>
                {roamingPath}
            </p>
            <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                Choose whether to move this data into profile "{profileName}" or to back it up and start fresh.
                Cancelling will abort this launch.
            </p>
        </PopupPanel>
    );
}
