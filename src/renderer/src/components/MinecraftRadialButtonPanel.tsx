import { useState } from "react";

import { MinecraftRadialButton } from "@renderer/components/MinecraftRadialButton";

type RadialButtonPanelProperties = {
    elements: {
        text: string;
        value: string;
        className?: string;
    }[];

    default_selected_value?: string;

    onChange: (selected_value: string) => void;
};

export function MinecraftRadialButtonPanel({
    elements,
    default_selected_value,
    onChange,
}: RadialButtonPanelProperties) {
    const [selected_value, setSelectedValue] = useState(default_selected_value);

    function handleSelect(value: string) {
        setSelectedValue(value);
        onChange(value);
    }

    return (
        <>
            <div className="radial-button-panel">
                {elements.map(element => {
                    return (
                        <MinecraftRadialButton
                            key={element.value}
                            text={element.text}
                            value={element.value}
                            selected={selected_value === element.value}
                            className={element.className}
                            onChange={handleSelect}
                        />
                    );
                })}
            </div>
        </>
    );
}
