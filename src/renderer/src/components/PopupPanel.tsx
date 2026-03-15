import React, { createContext, useCallback, useContext, useRef, useState } from "react";

type PopupPanelProps = {
    children: React.ReactNode;
    onExit?: () => void;
};

const PopupCloseContext = createContext<(callback: () => void) => void>((cb) => cb());

export function usePopupClose() {
    return useContext(PopupCloseContext);
}

export function PopupPanel({ children, onExit }: PopupPanelProps) {
    const [closing, setClosing] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);

    const animateClose = useCallback((callback: () => void) => {
        if (closing) return;
        setClosing(true);

        const picker = panelRef.current?.querySelector(".version-picker") as HTMLElement | null;
        if (picker) {
            picker.style.animation = "popup-scale-out 0.1s ease-in forwards";
        }

        setTimeout(callback, 100);
    }, [closing]);

    const handleBackdropClick = useCallback(() => {
        if (!onExit) return;
        animateClose(onExit);
    }, [onExit, animateClose]);

    return (
        <PopupCloseContext.Provider value={animateClose}>
            <div ref={panelRef} className={`popup-panel${closing ? " popup-panel-closing" : ""}`} onClick={handleBackdropClick}>
                {children}
            </div>
        </PopupCloseContext.Provider>
    );
}
