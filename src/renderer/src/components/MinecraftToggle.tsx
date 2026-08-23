import { useState } from "react";

import { clickable } from "./Clickable";

// Imported rather than written as "/images/...": a root-relative URL resolves against the drive
// root once the packaged app is served over file://, which is why these 404'd as /C:/images/...
import offStateImage from "@renderer/assets/images/button/off-state.png";
import onStateImage from "@renderer/assets/images/button/on-state.png";

type MinecraftToggleProps = {
    isChecked: boolean;
    setIsChecked: (checked: boolean) => void;
    label?: string;
};

export function MinecraftToggle({ isChecked, setIsChecked, label }: MinecraftToggleProps) {
    const [hasInteracted, setHasInteracted] = useState(false);

    const handleCheckboxChange = () => {
        setHasInteracted(true);
        setIsChecked(!isChecked);
    };

    const toggleClass = hasInteracted
        ? isChecked
            ? " toggle-anim-on"
            : " toggle-anim-off"
        : isChecked
          ? " toggle-no-anim-on"
          : " toggle-no-anim-off";

    return (
        <div
            className="toggle_panel"
            {...clickable(handleCheckboxChange, {
                role: "switch",
                checked: isChecked,
                label,
            })}
        >
            <div className="toggle_base">
                <div className="toggle_base_on">
                    <img className="toggle_base_on_image" src={onStateImage} alt="" />
                </div>

                <div className="toggle_base_off">
                    <img className="toggle_base_off_image" src={offStateImage} alt="" />
                </div>
            </div>

            <div className={"toggle" + toggleClass}>
                <div className="toggle_top"></div>
                <div className="toggle_side"></div>
            </div>
        </div>
    );
}
