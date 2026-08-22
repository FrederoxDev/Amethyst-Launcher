import { MinecraftRadialButton } from "@renderer/components/MinecraftRadialButton";

type RadialButtonPanelProperties = {
    elements: {
        text: string;
        value: string;
        className?: string;
    }[];

    /** The selected value. Controlled: the panel renders what it is given, nothing else. */
    default_selected_value?: string;

    onChange: (selected_value: string) => void;
};

export function MinecraftRadialButtonPanel({
    elements,
    default_selected_value,
    onChange,
}: RadialButtonPanelProperties) {
    return (
        <div className="radial-button-panel" role="radiogroup">
            {elements.map(element => (
                <MinecraftRadialButton
                    key={element.value}
                    text={element.text}
                    value={element.value}
                    selected={default_selected_value === element.value}
                    className={element.className}
                    onChange={onChange}
                />
            ))}
        </div>
    );
}
