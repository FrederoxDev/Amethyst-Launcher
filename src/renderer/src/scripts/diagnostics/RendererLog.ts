import {
    LOG_IPC,
    LOG_IPC_PATH,
    LOG_IPC_SYNC,
    LogEntry,
    LogLevel,
    describeError,
    echoToConsole,
    installConsoleForwarder,
} from "@shared/diagnostics/Log";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

function send(entry: LogEntry, blocking = false): void {
    try {
        if (blocking) ipcRenderer.sendSync(LOG_IPC_SYNC, entry);
        else ipcRenderer.send(LOG_IPC, entry);
    } catch {
        // Never let a dead IPC channel turn into a second failure on the way out.
    }
}

/** Records a line and echoes it to DevTools, without the console shim recording it twice. */
export function writeLauncherLog(level: LogLevel, scope: string, message: string): void {
    const entry: LogEntry = { time: Date.now(), source: "renderer", scope, level, message };
    echoToConsole(level, message);
    send(entry);
}

export function launcherLogPath(): string {
    try {
        return ipcRenderer.sendSync(LOG_IPC_PATH) as string;
    } catch {
        return "";
    }
}

/**
 * Anything that escapes React or a promise chain. Sent blocking, because the usual reason a
 * line like this exists is that the window is about to stop being able to send anything.
 */
export function reportFatal(scope: string, message: string): void {
    const entry: LogEntry = { time: Date.now(), source: "renderer", scope, level: "ERROR", message };
    send(entry, true);
}

function installGlobalHandlers(): void {
    window.addEventListener("error", event => {
        const detail =
            event.error instanceof Error
                ? describeError(event.error)
                : `${event.message} at ${event.filename}:${event.lineno}:${event.colno}`;
        reportFatal("window", `uncaught: ${detail}`);
    });

    window.addEventListener("unhandledrejection", event => {
        reportFatal("window", `unhandledRejection: ${describeError(event.reason)}`);
    });
}

installConsoleForwarder((level, message) =>
    send({ time: Date.now(), source: "renderer", scope: "console", level, message })
);
installGlobalHandlers();
