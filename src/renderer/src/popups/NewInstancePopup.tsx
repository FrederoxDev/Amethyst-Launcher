import { useState } from "react";

import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { usePopupClose } from "@renderer/components/PopupCloseContext";
import { TextInput } from "@renderer/components/TextInput";
import { PathUtils } from "@renderer/scripts/PathUtils";
import { Channel, channelLabel } from "@renderer/scripts/domain/Channel";
import { PopupUseArguments } from "@renderer/states/PopupStore";

export type RuntimeChoice = "vanilla" | "modded";
export type NewInstanceResult = { kind: "create"; name: string; runtime: RuntimeChoice } | { kind: "reselect" };

interface Props extends PopupUseArguments<NewInstanceResult | null> {
    versionLabel: string;
    channel: Channel;
}

export function NewInstancePopup({ submit: rawSubmit, versionLabel, channel }: Props) {
    const animateClose = usePopupClose();
    const submit = (result: NewInstanceResult | null) => animateClose(() => rawSubmit(result));

    const [name, setName] = useState("");
    const [runtime, setRuntime] = useState<RuntimeChoice>("vanilla");

    const canCreate = name.trim() !== "" && PathUtils.isValidFileName(name);

    return (
        <PopupPanel
            title="New Instance"
            onClose={() => submit(null)}
            size="md"
            footer={
                <MinecraftButton
                    text="Create"
                    disabled={!canCreate}
                    style={{ "--mc-button-container-w": "100px" }}
                    onClick={() => submit({ kind: "create", name: name.trim(), runtime })}
                />
            }
        >
            <TextInput
                label="Instance Name"
                text={name}
                setText={setName}
                placeholder="Enter a name for your instance..."
                style={{ width: "100%" }}
            />
            <div style={{ display: "flex", flexDirection: "column" }}>
                <p className="minecraft-seven text-input-label">Version</p>
                <div
                    className="new-instance-version-field"
                    style={{ justifyContent: "space-between", paddingRight: 4, gap: 8 }}
                    onClick={() => submit({ kind: "reselect" })}
                >
                    <span
                        className="minecraft-seven"
                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    >
                        {versionLabel}
                    </span>
                    <span className="minecraft-seven version-picker-item-tag" style={{ flexShrink: 0 }}>
                        {channelLabel(channel)}
                    </span>
                </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
                <p className="minecraft-seven text-input-label">Runtime</p>
                <MinecraftRadialButtonPanel
                    elements={[
                        { text: "Vanilla", value: "vanilla" },
                        { text: "Modded", value: "modded" },
                    ]}
                    default_selected_value={runtime}
                    onChange={value => setRuntime(value as RuntimeChoice)}
                />
            </div>
        </PopupPanel>
    );
}
