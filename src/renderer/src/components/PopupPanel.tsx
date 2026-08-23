import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

export type PopupSize = "sm" | "md" | "lg" | "xl" | "xxl";
export type PopupFooterAlign = "start" | "end" | "between";

// Module-level registry so stacked popups can coordinate which one owns the
// dark backdrop overlay and which one responds to Escape/Enter. Only the
// topmost popup renders the overlay (the rest are transparent) and only the
// topmost reacts to keyboard shortcuts.
const popupRegistry: symbol[] = [];
const registryListeners = new Set<() => void>();
function notifyListeners() {
    registryListeners.forEach(fn => fn());
}

type PopupPanelProps = {
    title?: string;
    onClose?: () => void;
    onConfirm?: () => void;
    footer?: React.ReactNode;
    footerAlign?: PopupFooterAlign;
    size?: PopupSize;
    boxClassName?: string;
    boxStyle?: React.CSSProperties;
    bodyClassName?: string;
    bodyStyle?: React.CSSProperties;
    children: React.ReactNode;
};

const PopupCloseContext = createContext<(callback: () => void) => void>(cb => cb());

export function usePopupClose() {
    return useContext(PopupCloseContext);
}

export function PopupPanel({
    title,
    onClose,
    onConfirm,
    footer,
    footerAlign = "end",
    size = "md",
    boxClassName,
    boxStyle,
    bodyClassName = "popup-body",
    bodyStyle,
    children,
}: PopupPanelProps) {
    const [closing, setClosing] = useState(false);
    const [isTop, setIsTop] = useState(false);
    const boxRef = useRef<HTMLDivElement>(null);
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

    const animateClose = useCallback(
        (callback: () => void) => {
            if (closing) return;

            // If there's a popup below this one, hand off overlay ownership
            // immediately so the lower popup's backdrop is visible before this one
            // finishes fading out. (When this is the only popup, keep it in the
            // registry so the backdrop fade-out animation can still play.)
            const isTopNow = popupRegistry[popupRegistry.length - 1] === id;
            if (isTopNow && popupRegistry.length > 1) {
                const idx = popupRegistry.lastIndexOf(id);
                if (idx !== -1) popupRegistry.splice(idx, 1);
                notifyListeners();
            }

            setClosing(true);
            if (boxRef.current) {
                boxRef.current.style.animation = "popup-scale-out 0.1s ease-in forwards";
            }
            setTimeout(callback, 100);
        },
        [closing]
    );

    const handleBackdropClick = useCallback(() => {
        if (!onClose) return;
        animateClose(onClose);
    }, [onClose, animateClose]);

    const handleCloseClick = useCallback(() => {
        if (!onClose) return;
        animateClose(onClose);
    }, [onClose, animateClose]);

    useEffect(() => {
        if (!onClose) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== "Escape") return;
            if (popupRegistry[popupRegistry.length - 1] !== id) return;
            animateClose(onClose);
        };
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose, animateClose]);

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

    const hasHeader = title !== undefined || onClose !== undefined;

    return (
        <PopupCloseContext.Provider value={animateClose}>
            <div
                className={`popup-panel${closing && isTop ? " popup-panel-closing" : ""}${!isTop ? " popup-panel-no-overlay" : ""}`}
                onClick={handleBackdropClick}
            >
                <div
                    ref={boxRef}
                    className={`popup-box popup-box--${size}${boxClassName ? ` ${boxClassName}` : ""}`}
                    style={boxStyle}
                    onClick={e => e.stopPropagation()}
                >
                    {hasHeader && (
                        <>
                            <div className="popup-header">
                                {title !== undefined && <p className="minecraft-seven popup-title">{title}</p>}
                                {onClose && (
                                    <div className="popup-close" onClick={handleCloseClick}>
                                        <svg width="20" height="20" viewBox="0 0 12 12">
                                            <polygon
                                                className="fill-[#FFFFFF]"
                                                fillRule="evenodd"
                                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1"
                                            />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            <div className="popup-divider" />
                        </>
                    )}
                    <div className={bodyClassName} style={bodyStyle}>
                        {children}
                    </div>
                    {footer !== undefined && (
                        <>
                            <div className="popup-divider" />
                            <div className={`popup-footer popup-footer--${footerAlign}`}>{footer}</div>
                        </>
                    )}
                </div>
            </div>
        </PopupCloseContext.Provider>
    );
}
