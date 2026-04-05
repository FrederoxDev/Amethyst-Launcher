import { Popup } from "@renderer/states/PopupStore";

export default function PopupRenderer() {
    const nodes = Popup.useState(state => state.nodes);
    return <>{nodes}</>;
}
