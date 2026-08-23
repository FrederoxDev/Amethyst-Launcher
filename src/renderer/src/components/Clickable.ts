import React from "react";

/** Anything a user can tab to inside a container. */
export const FOCUSABLE_SELECTOR =
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), " +
    '[tabindex]:not([tabindex="-1"])';

export interface ClickableOptions {
    disabled?: boolean;
    role?: "button" | "switch" | "radio";
    label?: string;
    checked?: boolean;
}

export interface ClickableProps {
    role: string;
    tabIndex: number;
    "aria-disabled"?: true;
    "aria-label"?: string;
    "aria-checked"?: boolean;
    onClick(event: React.MouseEvent): void;
    onKeyDown(event: React.KeyboardEvent): void;
}

/**
 * Turns a plain `<div>` into a control the keyboard can reach and activate.
 * Spread onto the element that carries the click.
 */
export function clickable(onClick: (() => void) | undefined, options: ClickableOptions = {}): ClickableProps {
    const { disabled = false, role = "button", label, checked } = options;
    const active = !disabled && onClick !== undefined;

    return {
        role,
        tabIndex: active ? 0 : -1,
        ...(disabled ? { "aria-disabled": true as const } : {}),
        ...(label !== undefined ? { "aria-label": label } : {}),
        ...(checked !== undefined ? { "aria-checked": checked } : {}),
        onClick: () => {
            if (active) onClick();
        },
        onKeyDown: (event: React.KeyboardEvent) => {
            if (!active) return;
            if (event.key !== "Enter" && event.key !== " " && event.key !== "Spacebar") return;
            event.preventDefault();
            event.stopPropagation();
            onClick();
        },
    };
}
