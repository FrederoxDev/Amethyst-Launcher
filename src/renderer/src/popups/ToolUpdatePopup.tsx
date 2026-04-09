import { MainPanel, MainPanelSection, PanelIndent } from "@renderer/components/MainPanel";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";

export default function ToolUpdatePopup({ name, currentVersion, latestVersion, accept, decline }: {
    name: string;
    currentVersion: string;
    latestVersion: string;
    accept: () => void;
    decline: () => void;
}) {
    return (
        <PopupPanel>
            <div className="app-consent-panel" onClick={e => e.stopPropagation()}>
                <MainPanel>
                    <MainPanelSection>
                        <p>New {name} update available</p>
                        <PanelIndent className="app-consent-indent">
                            <p>{name} is outdated, do you want to update it?</p>
                            <p>Current version: {currentVersion}</p>
                            <p>Latest version: {latestVersion}</p>
                        </PanelIndent>
                        <div className="app-consent-actions">
                            <MinecraftButton
                                text="Update!"
                                onClick={() => accept()}
                            />
                            <MinecraftButton
                                text="Don't update!"
                                buttonStyle={MinecraftButtonStyle.Warn}
                                onClick={() => decline()}
                            />
                        </div>
                    </MainPanelSection>
                </MainPanel>
            </div>
        </PopupPanel>
    );
}