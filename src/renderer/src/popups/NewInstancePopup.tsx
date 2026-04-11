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
        <PopupPanel>
            <div className="version-picker new-instance-popup" onClick={e => e.stopPropagation()}>
                <div className="version-picker-header">
                    <p className="minecraft-seven" style={{ fontSize: "16px" }}>New Instance</p>
                    <div className="version-popup-close" onClick={() => submit(null)}>
                        <svg width="20" height="20" viewBox="0 0 12 12">
                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                        </svg>
                    </div>
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-import-body">
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
                </div>
                <div className="version-picker-divider" />
                <div className="version-picker-footer">
                    <MinecraftButton text="Create" disabled={!canCreate} style={{ "--mc-button-container-w": "100px" }} onClick={() => submit({ kind: "create", name: name.trim(), runtime })} />
                </div>
            </div>
        </PopupPanel>
    );
}
