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
    containerBorderColor: "var(--color-outline)",
    realContainerBorderColor: "var(--color-confirm-border)",
    baseBgColor: "var(--color-confirm)",
    baseTopleftBorderColor: "var(--color-confirm-light)",
    baseBottomrightBorderColor: "var(--color-confirm-mid)",
    baseHoverBgColor: "var(--color-confirm-dark)",
    textColor: "var(--color-text)",
    cursor: "pointer",
    pointerEvents: "auto",
};

export const RED_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "var(--color-outline)",
    realContainerBorderColor: "var(--color-danger-border)",
    baseBgColor: "var(--color-danger)",
    baseTopleftBorderColor: "var(--color-danger-light)",
    baseBottomrightBorderColor: "var(--color-danger-mid)",
    baseHoverBgColor: "var(--color-danger-dark)",
    textColor: "var(--color-text)",
    cursor: "pointer",
    pointerEvents: "auto",
};

export const GRAY_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "var(--color-outline)",
    realContainerBorderColor: "#333334",
    baseBgColor: "var(--color-surface)",
    baseTopleftBorderColor: "var(--color-surface-hover)",
    baseBottomrightBorderColor: "#3a3b3c",
    baseHoverBgColor: "#3a3b3c",
    textColor: "var(--color-text)",
    cursor: "pointer",
    pointerEvents: "auto",
};

export const DISABLED_MINECRAFT_BUTTON: MinecraftButtonColorPallete = {
    containerBorderColor: "var(--color-border)",
    realContainerBorderColor: "#8c8d90",
    baseBgColor: "#b1b2b5",
    baseTopleftBorderColor: "#b1b2b5",
    baseBottomrightBorderColor: "#b1b2b5",
    baseHoverBgColor: "#b1b2b5",
    textColor: "var(--color-border)",
    cursor: "not-allowed",
    pointerEvents: "none",
};
