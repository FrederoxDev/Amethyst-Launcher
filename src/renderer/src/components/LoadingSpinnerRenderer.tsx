import { LoadSpinner } from "@renderer/states/LoadSpinnerStore";
import "@renderer/styles/components/LoadingSpinnerRenderer.css";
import { PopupPanel } from "./PopupPanel";

export default function LoadingSpinnerRenderer() {
    const {
        visible,
        text
    } = LoadSpinner.useState();

    if (!visible)
        return null;

    return (
        <PopupPanel>
            <div className="spinner-root">
                <div className="spinner"/>
                <p className="minecraft-seven launcher-load-spinner-text">{text}</p>
            </div>
        </PopupPanel>
    );
}