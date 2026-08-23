import { Fragment } from "react";
import { Popup } from "@renderer/states/PopupStore";

export default function PopupRenderer() {
    const nodes = Popup.useState(state => state.nodes);
    return (
        <>
            {nodes.map((node, index) => (
                <Fragment key={index}>{node}</Fragment>
            ))}
        </>
    );
}
