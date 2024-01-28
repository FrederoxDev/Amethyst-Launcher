import { useState } from "react";

type MinecraftButtonProps = {
    text: string,
    disabled?: boolean
    onClick?: () => void,
    style?: MinecraftButtonStyle
}

export enum MinecraftButtonStyle {
    Confirm,
    Warn
}

export default function MinecraftButton({text, onClick, disabled = false, style}: MinecraftButtonProps) {
    let topCol = "#3C8527";
    let topBorderCol = "#4F913C";
    let topHoverCol = "#2A641C";
    let sideCol = "#1D4D13";

    if (style == MinecraftButtonStyle.Warn) {
        topCol = "#CA3636";
        topBorderCol = "#CF4A4A";
        topHoverCol = "#C02D2D";
        sideCol = "#AD1D1D";
    }

    const [ isHovered, setIsHovered ] = useState(false);

    return (
        <div className={`h-[52px]`} onClick={() => {
            if (disabled) return;
            onClick?.();
        }} onMouseEnter={() => setIsHovered(true)} onMouseLeave={() => setIsHovered(false)}>
            <div className="border-[2px] border-[#1E1E1F] h-[48px] cursor-pointer active:translate-y-[4px] active:h-[44px] group">
                <div className={`border-[2px] h-[40px] box-border flex items-center justify-center`}
                    style={{ backgroundColor: isHovered ? topHoverCol : topCol, borderColor: topBorderCol }}
                >
                    <p className="minecraft-seven text-[16px] text-white">{ text }</p>
                </div>
                <div className={`h-[4px] box-border minecraft-button-shadow group-active:h-[0px]`} 
                    style={{ backgroundColor: sideCol }}></div>
            </div>
        </div>
    )
}