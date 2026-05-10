import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { MinecraftRadialButtonPanel } from "@renderer/components/MinecraftRadialButtonPanel";
import { PopupPanel, usePopupClose } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { PopupUseArguments } from "@renderer/states/PopupStore";
import { useState } from "react";
import { PathUtils } from "@renderer/scripts/PathUtils";

export type RuntimeType = "vanilla" | "modded";
export type NewInstanceResult = { kind: "create"; name: string; runtime: RuntimeType } | { kind: "reselect" };

interface NewInstancePopupProps extends PopupUseArguments<NewInstanceResult | null> {
    versionLabel: string;
}

export function NewInstancePopup({ submit: rawSubmit, versionLabel }: NewInstancePopupProps) {
    const animateClose = usePopupClose();
    const submit = (result: NewInstanceResult | null) => animateClose(() => rawSubmit(result));

    const [name, setName] = useState("");
    const [runtime, setRuntime] = useState<RuntimeType>("vanilla");

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
                <div className="new-instance-version-field" onClick={() => submit({ kind: "reselect" })}>
                    <span className="minecraft-seven">{versionLabel}</span>
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
                    onChange={value => setRuntime(value as RuntimeType)}
                />
            </div>
        </PopupPanel>
    );
}
