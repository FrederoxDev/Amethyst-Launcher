import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { Popup } from "@renderer/states/PopupStore";

interface ToolUpdateOptions {
    name: string;
    currentVersion: string;
    latestVersion: string;
}

/** Asks whether to update a tool. Resolves `true` when the user accepted. */
export function askToolUpdate({ name, currentVersion, latestVersion }: ToolUpdateOptions): Promise<boolean> {
    return Popup.ask<boolean>(({ submit }) => (
        <PopupPanel
            title={`New ${name} update available`}
            size="md"
            footerAlign="between"
            footer={
                <>
                    <MinecraftButton text="Update!" onClick={() => submit(true)} />
                    <MinecraftButton
                        text="Don't update!"
                        buttonStyle={MinecraftButtonStyle.Warn}
                        onClick={() => submit(false)}
                    />
                </>
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                {name} is outdated, do you want to update it?
            </p>
            <p className="minecraft-seven" style={{ fontSize: "12px" }}>
                Current version: {currentVersion}
            </p>
            <p className="minecraft-seven" style={{ fontSize: "12px" }}>
                Latest version: {latestVersion}
            </p>
        </PopupPanel>
    ));
}
