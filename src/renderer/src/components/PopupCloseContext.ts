import { createContext, useContext } from "react";

interface PopupCloseControl {
    closing: boolean;
    /**
     * Whether this popup is the one on top of the stack. Only the top popup paints the backdrop
     * and answers the keyboard; the ones below it stay visible but inert.
     */
    isTop: boolean;
    animateClose(callback: () => void): void;
}

export const PopupCloseContext = createContext<PopupCloseControl>({
    closing: false,
    isTop: true,
    animateClose: callback => callback(),
});

/** Runs `callback` once the popup's closing animation is over. */
export function usePopupClose(): (callback: () => void) => void {
    return useContext(PopupCloseContext).animateClose;
}
