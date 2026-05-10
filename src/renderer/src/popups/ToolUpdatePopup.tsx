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
        <PopupPanel
            title={`New ${name} update available`}
            size="md"
            footerAlign="between"
            footer={
                <>
                    <MinecraftButton text="Update!" onClick={accept} />
                    <MinecraftButton text="Don't update!" buttonStyle={MinecraftButtonStyle.Warn} onClick={decline} />
                </>
            }
        >
            <p className="minecraft-seven" style={{ fontSize: "12px", lineHeight: 1.5 }}>
                {name} is outdated, do you want to update it?
            </p>
            <p className="minecraft-seven" style={{ fontSize: "12px" }}>Current version: {currentVersion}</p>
            <p className="minecraft-seven" style={{ fontSize: "12px" }}>Latest version: {latestVersion}</p>
        </PopupPanel>
    );
}
