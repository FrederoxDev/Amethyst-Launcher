import React, { useRef } from "react";

type MinecraftToggleProps = {
    isChecked: boolean;
    setIsChecked: React.Dispatch<React.SetStateAction<boolean>>;
};

export function MinecraftToggle({ isChecked, setIsChecked }: MinecraftToggleProps) {
    const hasInteracted = useRef(false);

    const handleCheckboxChange = () => {
        hasInteracted.current = true;
        setIsChecked(!isChecked);
    };

    const toggleClass = hasInteracted.current
        ? (isChecked ? " toggle-anim-on" : " toggle-anim-off")
        : (isChecked ? " toggle-no-anim-on" : " toggle-no-anim-off");

    return (
        <div className="toggle_panel" onClick={handleCheckboxChange}>
            <div className="toggle_base">
                <div className="toggle_base_on">
                    <img className="toggle_base_on_image" src="/images/button/on-state.png" alt="" />
                </div>

                <div className="toggle_base_off">
                    <img className="toggle_base_off_image" src="/images/button/off-state.png" alt="" />
                </div>
            </div>

            <div className={"toggle" + toggleClass}>
                <div className="toggle_top"></div>
                <div className="toggle_side"></div>
            </div>
        </div>
    );
}
