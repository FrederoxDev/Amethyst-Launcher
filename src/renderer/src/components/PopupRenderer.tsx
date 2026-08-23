import { Popup } from "@renderer/states/PopupStore";
import { PopupCloseBoundary } from "./PopupPanel";

export default function PopupRenderer() {
    const entries = Popup.useState(state => state.entries);

    if (entries.length === 0) return null;

    // The popup that owns the backdrop and the keyboard is the highest one that is not on its
    // way out. When the whole stack is closing there is nothing to hand over to, so the top
    // entry keeps it and its backdrop fade plays out.
    let topIndex = entries.length - 1;
    for (let i = entries.length - 1; i >= 0; i--) {
        if (!entries[i].closing) {
            topIndex = i;
            break;
        }
    }

    return (
        <>
            {entries.map((entry, index) => (
                <PopupCloseBoundary key={entry.id} id={entry.id} isTop={index === topIndex}>
                    {entry.node}
                </PopupCloseBoundary>
            ))}
        </>
    );
}
