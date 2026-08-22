import { createContext, useContext } from "react";

interface PopupCloseControl {
    closing: boolean;
    animateClose(callback: () => void): void;
}

export const PopupCloseContext = createContext<PopupCloseControl>({
    closing: false,
    animateClose: callback => callback(),
});

/** Runs `callback` once the popup's closing animation is over. */
export function usePopupClose(): (callback: () => void) => void {
    return useContext(PopupCloseContext).animateClose;
}
