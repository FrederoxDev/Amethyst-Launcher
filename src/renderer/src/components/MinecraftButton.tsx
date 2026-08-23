import "@renderer/styles/components/MinecraftButton.css";
import { CSSProperties } from "react";
import { clickable } from "./Clickable";
import { MinecraftButtonStyle } from "./MinecraftButtonStyle";
import {
  DISABLED_MINECRAFT_BUTTON,
  GREEN_MINECRAFT_BUTTON,
  MinecraftButtonColorPallete,
  RED_MINECRAFT_BUTTON,
} from "./MinecraftButtonPalette";

type MinecraftCSSVariables = CSSProperties & {
  [key: `--${string}`]: string | number | undefined;
};

type MinecraftButtonProps = {
  text: string;
  disabled?: boolean;
  onClick?: () => void;
  style?: MinecraftCSSVariables;
  colorPallete?: MinecraftButtonColorPallete;
  buttonStyle?: MinecraftButtonStyle;
};

export function MinecraftButton({
  text,
  onClick,
  disabled = false,
  style = {},
  colorPallete = GREEN_MINECRAFT_BUTTON,
  buttonStyle,
}: MinecraftButtonProps) {
  if (buttonStyle === MinecraftButtonStyle.Warn) {
    colorPallete = RED_MINECRAFT_BUTTON;
  }
  colorPallete = disabled
    ? DISABLED_MINECRAFT_BUTTON
    : colorPallete || GREEN_MINECRAFT_BUTTON;
  const cssVars: MinecraftCSSVariables = {
    "--mc-button-container-h": "48px",
    "--mc-button-container-w": "100%",
    "--mc-button-container-border-width": "2px",
    "--mc-button-container-border-color": colorPallete?.containerBorderColor,
    "--mc-button-real-container-border-color":
      colorPallete?.realContainerBorderColor,
    "--mc-button-base-bg-color": colorPallete?.baseBgColor,
    "--mc-button-base-topleft-border-color":
      colorPallete?.baseTopleftBorderColor,
    "--mc-button-base-bottomright-border-color":
      colorPallete?.baseBottomrightBorderColor,
    "--mc-button-base-hover-bg-color": colorPallete?.baseHoverBgColor,
    "--mc-button-shadow-size": "4px",
    "--mc-button-text-color": colorPallete?.textColor,
    ...style,
  };

  return (
    <div style={cssVars}>
      <div
        className="button-container"
        {...clickable(onClick, { disabled, label: text })}
        style={{ cursor: colorPallete?.cursor }}
      >
        <div
          className="button-real-container"
          style={{ pointerEvents: colorPallete?.pointerEvents }}
        >
          <div className="button-base">
            <div className="button-text">{text}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
