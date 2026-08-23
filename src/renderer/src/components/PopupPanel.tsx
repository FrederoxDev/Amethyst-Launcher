import React, { useCallback, useContext, useEffect, useRef, useState } from "react";

import { clickable, FOCUSABLE_SELECTOR } from "./Clickable";
import { PopupCloseContext } from "./PopupCloseContext";

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

/** Kept in step with `popup-scale-out` / `popup-backdrop-out` in PopupPanel.css. */
const CLOSE_ANIMATION_MS = 100;

/**
 * Owns the closing animation and the one-shot guard for everything a popup renders.
 * It sits above the popup's own component so `usePopupClose` reaches it from the
 * body as well as from `PopupPanel`.
 */
export function PopupCloseBoundary({ children }: { children: React.ReactNode }) {
    const [closing, setClosing] = useState(false);
    const closingRef = useRef(false);
    const animationDone = useRef(false);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(
        () => () => {
            if (timer.current !== null) clearTimeout(timer.current);
        },
        []
    );

    const animateClose = useCallback((callback: () => void) => {
        // Closing handlers wrap each other — a panel's onClose is usually itself a wrapped
        // submit — so once the animation is over the rest of the chain runs straight through.
        if (animationDone.current) {
            callback();
            return;
        }
        if (closingRef.current) return;
        closingRef.current = true;
        setClosing(true);
        timer.current = setTimeout(() => {
            timer.current = null;
            animationDone.current = true;
            callback();
        }, CLOSE_ANIMATION_MS);
    }, []);

    return <PopupCloseContext.Provider value={{ closing, animateClose }}>{children}</PopupCloseContext.Provider>;
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
    const { closing, animateClose } = useContext(PopupCloseContext);
    const boxRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const restoreTo = document.activeElement as HTMLElement | null;
        const box = boxRef.current;
        const first = box?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
        (first ?? box)?.focus();
        return () => restoreTo?.focus?.();
    }, []);

    const requestClose = useCallback(() => {
        if (!onClose) return;
        animateClose(onClose);
    }, [onClose, animateClose]);

    const handleKeyDown = useCallback(
        (event: React.KeyboardEvent<HTMLDivElement>) => {
            if (event.key === "Escape") {
                event.stopPropagation();
                requestClose();
                return;
            }
            if (event.key !== "Tab") return;

            const box = boxRef.current;
            if (!box) return;

            const focusable = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
                element => element.offsetParent !== null
            );
            if (focusable.length === 0) {
                event.preventDefault();
                box.focus();
                return;
            }

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            const active = document.activeElement;

            if (event.shiftKey && (active === first || active === box)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || active === box)) {
                event.preventDefault();
                first.focus();
            }
        },
        [requestClose]
    );

    const hasHeader = title !== undefined || onClose !== undefined;

    return (
        <div
            className={`popup-panel${closing ? " popup-panel-closing" : ""}`}
            onClick={requestClose}
            onKeyDown={handleKeyDown}
        >
            <div
                ref={boxRef}
                role="dialog"
                aria-modal="true"
                aria-label={title}
                tabIndex={-1}
                className={`popup-box popup-box--${size}${closing ? " popup-box-closing" : ""}${boxClassName ? ` ${boxClassName}` : ""}`}
                style={boxStyle}
                onClick={e => e.stopPropagation()}
            >
                {hasHeader && (
                    <>
                        <div className="popup-header">
                            {title !== undefined && <p className="minecraft-seven popup-title">{title}</p>}
                            {onClose && (
                                <div className="popup-close" {...clickable(requestClose, { label: "Close" })}>
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
    );
}
