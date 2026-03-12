import "@renderer/styles/components/MinecraftButton.css";
import { CSSProperties } from "react";

type MinecraftCSSVariables = CSSProperties & {
    [key: `--${string}`]: string | number | undefined;
};

export interface MinecraftButtonColorPallete {
    containerBorderColor?: string;
    realContainerBorderColor?: string;
    baseBgColor?: string;
    baseTopleftBorderColor?: string;
    baseBottomrightBorderColor?: string;
    baseHoverBgColor?: string;
    textColor?: string;
    cursor?: "pointer" | "not-allowed";
    pointerEvents?: "auto" | "none";
}

export const GREEN_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "#1e1e1f",
    realContainerBorderColor: "#1d4d13",
    baseBgColor: "#3c8527",
    baseTopleftBorderColor: "#639d52",
    baseBottomrightBorderColor: "#4f913c",
    baseHoverBgColor: "#2a641c",
    textColor: "#fff",
    cursor: "pointer",
    pointerEvents: "auto"
};

export const RED_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "#1e1e1f",
    realContainerBorderColor: "#ad1d1d",
    baseBgColor: "#ca3636",
    baseTopleftBorderColor: "#d55e5e",
    baseBottomrightBorderColor: "#cf4a4a",
    baseHoverBgColor: "#c02d2d",
    textColor: "#fff",
    cursor: "pointer",
    pointerEvents: "auto"
};

export const WHITE_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "#1e1e1f",
    realContainerBorderColor: "#58585a",
    baseBgColor: "#d0d1d4",
    baseTopleftBorderColor: "#ecedee",
    baseBottomrightBorderColor: "#e3e3e5",
    baseHoverBgColor: "#b1b2b5",
    textColor: "#000",
    cursor: "pointer",
    pointerEvents: "auto"
};

export const DISABLED_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "#58585a",
    realContainerBorderColor: "#8c8d90",
    baseBgColor: "#b1b2b5",
    baseTopleftBorderColor: "#b1b2b5",
    baseBottomrightBorderColor: "#b1b2b5",
    baseHoverBgColor: "#b1b2b5",
    textColor: "#58585a",
    cursor: "not-allowed",
    pointerEvents: "none"
};

type MinecraftButtonProps = {
    text: string;
    disabled?: boolean;
    onClick?: () => void;
    style?: MinecraftCSSVariables;
    colorPallete?: MinecraftButtonColorPallete;
};

export function MinecraftButton({ text, onClick, disabled = false, style = {}, colorPallete = GREEN_MINECRAFT_BUTTON }: MinecraftButtonProps) {
    colorPallete = disabled ? DISABLED_MINECRAFT_BUTTON : (colorPallete || GREEN_MINECRAFT_BUTTON);
    const cssVars: MinecraftCSSVariables = {
        "--mc-button-container-h": "48px",
        "--mc-button-container-w": "100%",
        "--mc-button-container-border-width": "2px",
        "--mc-button-container-border-color": colorPallete?.containerBorderColor,
        "--mc-button-real-container-border-color": colorPallete?.realContainerBorderColor,
        "--mc-button-base-bg-color": colorPallete?.baseBgColor,
        "--mc-button-base-topleft-border-color": colorPallete?.baseTopleftBorderColor,
        "--mc-button-base-bottomright-border-color": colorPallete?.baseBottomrightBorderColor,
        "--mc-button-base-hover-bg-color": colorPallete?.baseHoverBgColor,
        "--mc-button-shadow-size": "4px",
        "--mc-button-text-color": colorPallete?.textColor,
        ...style
    };

    return (
        <div style={cssVars}>
            <div className="button-container" onClick={() => {
                if (!disabled && onClick) onClick();
            }} style={{ 
                cursor: colorPallete?.cursor 
            }}>
                <div className="button-real-container" style={{ pointerEvents: colorPallete?.pointerEvents }}>
                    <div className="button-base">
                        <div className="button-text">{text}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}
