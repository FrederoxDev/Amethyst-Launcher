import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
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
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <p>Existing Minecraft data found</p>
                        <PanelIndent className="app-consent-indent">
                            <p>
                                Amethyst is switching to per-profile data folders. Existing Minecraft data
                                was found at:
                            </p>
                            <p>{roamingPath}</p>
                            <p>
                                Choose whether to move this data into profile "{profileName}" or to back it
                                up and start fresh. Cancelling will abort this launch.
                            </p>
                        </PanelIndent>
                        <div className="app-consent-actions">
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
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}
