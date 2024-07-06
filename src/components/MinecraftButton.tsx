import {useState} from "react";

type MinecraftButtonProps = {
    text: string,
    disabled?: boolean,
    onClick?: () => void,
    style?: MinecraftButtonStyle
}

export enum MinecraftButtonStyle {
    Confirm,
    Warn
}

export default function MinecraftButton({text, onClick, disabled = false, style}: MinecraftButtonProps) {
    return (
        <div className={`button_base`} onClick={() => { if (!disabled) { onClick?.() } }}>
            <div className="button_border">
                <div className={`button_top ${style === MinecraftButtonStyle.Warn ? "warn" : ""}`}>
                    <p className="button_text">{text}</p>
                </div>
                <div className={`button_side ${style === MinecraftButtonStyle.Warn ? "warn" : ""}`}></div>
            </div>
        </div>
    )
}