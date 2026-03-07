import { Popup } from "@renderer/states/PopupStore";

export default function PopupRenderer() {
    const {
        node
    } = Popup.useState();

    return node;
}