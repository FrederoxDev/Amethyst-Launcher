import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export type PopupSize = "sm" | "md" | "lg" | "xl" | "xxl";
export type PopupFooterAlign = "start" | "end" | "between";

type PopupPanelProps = {
    title?: string;
    onClose?: () => void;
    footer?: React.ReactNode;
    footerAlign?: PopupFooterAlign;
    size?: PopupSize;
    boxClassName?: string;
    boxStyle?: React.CSSProperties;
    bodyClassName?: string;
    bodyStyle?: React.CSSProperties;
    children: React.ReactNode;
};

const PopupCloseContext = createContext<(callback: () => void) => void>((cb) => cb());

export function usePopupClose() {
    return useContext(PopupCloseContext);
}

export function PopupPanel({
    title,
    onClose,
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
    const boxRef = useRef<HTMLDivElement>(null);

    const animateClose = useCallback((callback: () => void) => {
        if (closing) return;
        setClosing(true);
        if (boxRef.current) {
            boxRef.current.style.animation = "popup-scale-out 0.1s ease-in forwards";
        }
        setTimeout(callback, 100);
    }, [closing]);

    const handleBackdropClick = useCallback(() => {
        if (!onClose) return;
        animateClose(onClose);
    }, [onClose, animateClose]);

    const handleCloseClick = useCallback(() => {
        if (!onClose) return;
        animateClose(onClose);
    }, [onClose, animateClose]);

    const hasHeader = title !== undefined || onClose !== undefined;

    return (
        <PopupCloseContext.Provider value={animateClose}>
            <div className={`popup-panel${closing ? " popup-panel-closing" : ""}`} onClick={handleBackdropClick}>
                <div ref={boxRef} className={`popup-box popup-box--${size}${boxClassName ? ` ${boxClassName}` : ""}`} style={boxStyle} onClick={e => e.stopPropagation()}>
                    {hasHeader && (
                        <>
                            <div className="popup-header">
                                {title !== undefined && <p className="minecraft-seven popup-title">{title}</p>}
                                {onClose && (
                                    <div className="popup-close" onClick={handleCloseClick}>
                                        <svg width="20" height="20" viewBox="0 0 12 12">
                                            <polygon className="fill-[#FFFFFF]" fillRule="evenodd"
                                                points="11 1.576 6.583 6 11 10.424 10.424 11 6 6.583 1.576 11 1 10.424 5.417 6 1 1.576 1.576 1 6 5.417 10.424 1" />
                                        </svg>
                                    </div>
                                )}
                            </div>
                            <div className="popup-divider" />
                        </>
                    )}
                    <div className={bodyClassName} style={bodyStyle}>{children}</div>
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
