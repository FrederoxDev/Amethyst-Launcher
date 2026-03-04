import React from "react";

type PopupPanelProps = {
    children: React.ReactNode;
    onExit?: () => void;
};

export function PopupPanel({ children, onExit }: PopupPanelProps) {
    return <div className="popup-panel" onClick={onExit}>{children}</div>;
}
