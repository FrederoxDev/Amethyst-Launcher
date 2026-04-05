import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const popupRegistry: symbol[] = [];
const registryListeners = new Set<() => void>();
function notifyListeners() { registryListeners.forEach(fn => fn()); }

type PopupPanelProps = {
    children: React.ReactNode;
    onExit?: () => void;
    onConfirm?: () => void;
};

const PopupCloseContext = createContext<(callback: () => void) => void>((cb) => cb());

export function usePopupClose() {
    return useContext(PopupCloseContext);
}

export function PopupPanel({ children, onExit, onConfirm }: PopupPanelProps) {
    const [closing, setClosing] = useState(false);
    const [isTop, setIsTop] = useState(false);
    const panelRef = useRef<HTMLDivElement>(null);
    const id = useRef(Symbol()).current;

    useEffect(() => {
        popupRegistry.push(id);
        notifyListeners();

        const listener = () => setIsTop(popupRegistry[popupRegistry.length - 1] === id);
        registryListeners.add(listener);
        listener();

        return () => {
            const idx = popupRegistry.lastIndexOf(id);
            if (idx !== -1) popupRegistry.splice(idx, 1);
            registryListeners.delete(listener);
            notifyListeners();
        };
    }, []);

    const animateClose = useCallback((callback: () => void) => {
        if (closing) return;

        // If there's a popup below, transfer overlay ownership immediately so
        // the bottom popup's backdrop appears before this one's fades out.
        // (When this is the only popup, keep it in the registry so the
        //  backdrop-out animation can still play.)
        const isTopNow = popupRegistry[popupRegistry.length - 1] === id;
        if (isTopNow && popupRegistry.length > 1) {
            const idx = popupRegistry.lastIndexOf(id);
            if (idx !== -1) popupRegistry.splice(idx, 1);
            notifyListeners();
        }

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

    useEffect(() => {
        if (!onExit) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (popupRegistry[popupRegistry.length - 1] !== id) return;
            animateClose(onExit);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onExit, animateClose]);

    useEffect(() => {
        if (!onConfirm) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Enter") return;
            if (popupRegistry[popupRegistry.length - 1] !== id) return;
            if (e.target instanceof HTMLTextAreaElement) return;
            if (e.target instanceof HTMLButtonElement) return;
            onConfirm();
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onConfirm]);

    return (
        <PopupCloseContext.Provider value={animateClose}>
            <div ref={panelRef} className={`popup-panel${closing && isTop ? " popup-panel-closing" : ""}${!isTop ? " popup-panel-no-overlay" : ""}`} onClick={handleBackdropClick}>
                {children}
            </div>
        </PopupCloseContext.Provider>
    );
}
