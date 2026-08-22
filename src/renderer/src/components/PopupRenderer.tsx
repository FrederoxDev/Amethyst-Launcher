import { Popup } from "@renderer/states/PopupStore";
import { PopupCloseBoundary } from "./PopupPanel";

export default function PopupRenderer() {
    const node = Popup.useState(state => state.node);
    const generation = Popup.useState(state => state.generation);

    if (node === null) return null;

    return <PopupCloseBoundary key={generation}>{node}</PopupCloseBoundary>;
}
