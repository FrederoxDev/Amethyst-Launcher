import { useState } from "react";

import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { MinecraftButtonStyle } from "@renderer/components/MinecraftButtonStyle";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export const DELETE_CONFIRM_PHRASE = "DELETE MY DATA";

interface Props extends PopupUseArguments<boolean> {
    roamingPath: string;
}

export default function OnboardingDeleteConfirmPopup({ submit, roamingPath }: Props) {
    const [typed, setTyped] = useState("");
    // Allow whitespace around the phrase but keep the casing strict — typing
    // "DELETE MY DATA" in caps is the intentional friction, not the trimming.
    const canDelete = typed.trim() === DELETE_CONFIRM_PHRASE;

    return (
        <PopupPanel
            title="Delete Minecraft data?"
            size="md"
            footer={
                <>
                    <MinecraftButton
                        text="Delete forever"
                        disabled={!canDelete}
                        buttonStyle={MinecraftButtonStyle.Warn}
                        onClick={() => {
                            if (canDelete) submit(true);
                        }}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                    <MinecraftButton
                        text="Back"
                        colorPallete={GRAY_MINECRAFT_BUTTON}
                        onClick={() => submit(false)}
                        style={{ flex: 1, minWidth: 0 }}
                    />
                </>
            }
        >
            <div style={{ display: "flex", flexDirection: "column" }}>
                <p className="minecraft-seven text-input-label">Will permanently delete</p>
                <div className="new-instance-version-field" style={{ cursor: "default" }}>
                    <span className="minecraft-seven" style={{ wordBreak: "break-all" }}>
                        {roamingPath}
                    </span>
                </div>
            </div>
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5, color: "#ff8a8a" }}>
                All worlds, resource packs, settings, and screenshots will be lost. This cannot be undone.
            </p>
            <p className="minecraft-seven" style={{ fontSize: "14px", lineHeight: 1.5 }}>
                Type <span style={{ color: "#ff8a8a", fontWeight: "bold" }}>{DELETE_CONFIRM_PHRASE}</span> to confirm:
            </p>
            <TextInput
                label=""
                text={typed}
                setText={setTyped}
                placeholder={DELETE_CONFIRM_PHRASE}
                style={{ width: "100%" }}
                autoFocus
            />
        </PopupPanel>
    );
}
