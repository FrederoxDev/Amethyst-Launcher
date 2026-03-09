import { ProgressBar } from "@renderer/states/ProgressBarStore";
import React from "react";

import "@renderer/styles/components/ProgressBarRenderer.css"

export default function ProgressBarRenderer(): React.ReactNode | null {
    const {
        message,
        progress,
        show
    } = ProgressBar.useState();

    return (
        <div
            className={`launcher-progress ${show ? "launcher-progress-visible" : "launcher-progress-hidden"}`}
        >
            <div
                className={`launcher-progress-bar ${show ? "launcher-progress-bar-visible" : "launcher-progress-bar-hidden"}`}
                style={{ width: `${Math.max(0, Math.min(100, (progress ?? 0) * 100))}%` }}
            ></div>
            <p className="minecraft-seven launcher-progress-text" style={{ display: show ? "initial" : "none" }}>
                {message}
            </p>
        </div>
    );
}