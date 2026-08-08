// Imported first: the console shim and the window error handlers have to be in place before
// any other module runs, otherwise its startup logging goes nowhere.
import { launcherLogPath, reportFatal } from "@renderer/scripts/diagnostics/RendererLog";

import { Component, ReactNode } from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";

import App from "@renderer/App";
import { reportEnvironment } from "@renderer/scripts/diagnostics/EnvironmentReport";
import { log } from "@renderer/scripts/LauncherLog";

import "@renderer/styles/index.css";

interface ErrorBoundaryState {
    detail: string | null;
}

/** A throw during render blanks the window, so the report has to be drawn by the boundary itself. */
class ErrorBoundary extends Component<{ children: ReactNode }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { detail: null };

    static getDerivedStateFromError(error: unknown): ErrorBoundaryState {
        const e = error as Error;
        return { detail: e?.stack ?? String(error) };
    }

    componentDidCatch(error: unknown, info: { componentStack?: string | null }): void {
        const e = error as Error;
        reportFatal("react", `render failed: ${e?.stack ?? String(error)}\n${info.componentStack ?? ""}`);
    }

    render(): ReactNode {
        if (this.state.detail === null) return this.props.children;

        const logPath = launcherLogPath();
        const report = `${this.state.detail}\n\nLog file: ${logPath}`;

        return (
            <div style={{ padding: "24px", color: "#e6e6e6", fontFamily: "monospace", height: "100vh", overflow: "auto", background: "#1E1E1F" }}>
                <h1 style={{ fontSize: "18px", marginBottom: "8px" }}>The launcher could not draw this screen.</h1>
                <p style={{ fontSize: "13px", marginBottom: "12px", color: "#a0a0a0" }}>
                    Copy the text below and send it over, then restart the launcher.
                </p>
                <button
                    style={{ marginBottom: "12px", padding: "6px 14px", cursor: "pointer" }}
                    onClick={() => navigator.clipboard.writeText(report)}
                >
                    Copy details
                </button>
                <pre style={{ whiteSpace: "pre-wrap", fontSize: "12px", userSelect: "text" }}>{report}</pre>
            </div>
        );
    }
}

log("Renderer", `Renderer starting, log file ${launcherLogPath() || "unknown"}`);

ReactDOM.createRoot(document.getElementById("app") as HTMLElement).render(
    <ErrorBoundary>
        <HashRouter>
            <App />
        </HashRouter>
    </ErrorBoundary>
);

log("Renderer", "React root mounted");

// Registry and disk probes, so they wait until the window has drawn.
window.requestIdleCallback(() => {
    log("Renderer", "Window is idle, collecting the environment report for the log header");
    reportEnvironment();
}, { timeout: 5000 });

window.addEventListener("beforeunload", () => log("Renderer", "Window unloading"));
