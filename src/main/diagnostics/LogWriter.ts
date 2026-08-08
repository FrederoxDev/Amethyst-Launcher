import { app, ipcMain } from "electron";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

import {
    LOG_IPC,
    LOG_IPC_ENVIRONMENT,
    LOG_IPC_PATH,
    LOG_IPC_SYNC,
    LogEntry,
    LogLevel,
    describeError,
    fileStamp,
    formatEntry,
    installConsoleForwarder,
} from "../../shared/diagnostics/Log";

/** Enough runs to still hold the evidence after a tester reproduces a bug a few times. */
const KEEP_RUNS = 20;

/** How long the header waits on the renderer before writing what it has. */
const MACHINE_BLOCK_TIMEOUT_MS = 20_000;

const LABEL_WIDTH = 12;

export interface MachineReport {
    appx: string;
    registered: string[];
    dotnet: string;
    state: string;
}

const startedAt = Date.now();
const logsDir = path.join(app.getPath("appData"), "Amethyst", "Launcher", "Logs");
const logFile = path.join(logsDir, `launcher_${fileStamp(startedAt)}.log`);

let writable = true;
let machineBlockWritten = false;

function appendRaw(text: string): void {
    if (!writable) return;
    try {
        fs.appendFileSync(logFile, text, "utf-8");
    } catch {
        // A full or read-only disk must not take the launcher down with it.
        writable = false;
    }
}

export function writeEntry(entry: LogEntry): void {
    appendRaw(`${formatEntry(entry)}\n`);
}

export function mainLog(level: LogLevel, scope: string, message: string): void {
    writeEntry({ time: Date.now(), source: "main", scope, level, message });
}

export function launcherLogPath(): string {
    return logFile;
}

/**
 * A second instance hands its arguments to the running launcher and exits, so its file holds
 * nothing but a header. Left behind, those push real runs out of the rotation.
 */
export function discardRun(): void {
    writable = false;
    machineBlockWritten = true;
    try {
        fs.rmSync(logFile, { force: true });
    } catch {
        // Worst case it stays as one header-only file.
    }
}

/**
 * Rotation is by count, never by truncating or clearing the current file: a user who hits a bug
 * on their tenth attempt must still be able to hand over the run that shows it.
 */
function rotate(): void {
    let entries: string[];
    try {
        entries = fs.readdirSync(logsDir);
    } catch {
        return;
    }

    const runs = entries.filter(name => /^launcher_.*\.log$/i.test(name)).sort();
    for (const name of runs.slice(0, Math.max(0, runs.length - (KEEP_RUNS - 1)))) {
        try {
            fs.rmSync(path.join(logsDir, name), { force: true });
        } catch {
            // A log another process is holding open just survives one more run.
        }
    }
}

function label(name: string): string {
    return name.padEnd(LABEL_WIDTH, " ");
}

function continuation(): string {
    return " ".repeat(LABEL_WIDTH);
}

function probe(read: () => string): string {
    try {
        return read();
    } catch {
        return "unknown";
    }
}

function probeValue<T>(read: () => T, fallback: T): T {
    try {
        return read();
    } catch {
        return fallback;
    }
}

function localTime(time: number): string {
    const d = new Date(time);
    const offset = -d.getTimezoneOffset();
    const sign = offset < 0 ? "-" : "+";
    const hours = Math.floor(Math.abs(offset) / 60).toString().padStart(2, "0");
    const minutes = (Math.abs(offset) % 60).toString().padStart(2, "0");
    const stamp = fileStamp(time).replace("_", " ").replace(/-(\d{2})-(\d{2})$/, ":$1:$2");
    return `${stamp} (UTC${sign}${hours}:${minutes})`;
}

/** Windows keeps System32\config readable only to administrators, so opening it settles elevation. */
function isElevated(): boolean {
    if (process.platform !== "win32") return process.getuid?.() === 0;
    const dir = path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "config");
    try {
        fs.opendirSync(dir).closeSync();
        return true;
    } catch {
        return false;
    }
}

function formatBytes(bytes: number): string {
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1) return `${gb.toFixed(1)} GB`;
    return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

function freeSpace(target: string): string {
    const stats = fs.statfsSync(path.parse(path.resolve(target)).root);
    return `${formatBytes(stats.bavail * stats.bsize)} free on ${path.parse(path.resolve(target)).root}`;
}

function launcherPaths(): Record<string, string> {
    const appData = process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming");
    const launcher = path.join(appData, "Amethyst", "Launcher");
    return {
        amethyst: path.join(appData, "Amethyst"),
        versions: path.join(launcher, "Versions"),
        mods: path.join(launcher, "Mods"),
        tools: path.join(launcher, "Tools"),
        appdata: app.getPath("userData"),
    };
}

/**
 * Written before anything else can reach the file, from probes that cannot block, so a log
 * returned after an instant crash still says which build on which machine produced it.
 */
function writeHeader(): void {
    const lines: string[] = [`=== Amethyst Launcher ${probe(() => app.getVersion())} ===`];

    lines.push(`${label("started")}${probe(() => localTime(startedAt))}`);
    lines.push(`${label("os")}${probe(() => `${os.version()}, ${os.release()}, ${os.arch()}, locale ${Intl.DateTimeFormat().resolvedOptions().locale}`)}`);
    lines.push(`${label("electron")}${probe(() => `electron ${process.versions.electron}, chrome ${process.versions.chrome}, node ${process.versions.node}`)}`);
    lines.push(`${label("process")}${probe(() => `elevated=${isElevated()}, packaged=${app.isPackaged}, pid=${process.pid}, argv=[${process.argv.slice(1).join(" ")}]`)}`);

    const paths = probeValue<Record<string, string> | null>(launcherPaths, null);
    if (!paths) {
        lines.push(`${label("paths")}unknown`);
    }
    else {
        let first = true;
        for (const [name, value] of Object.entries(paths)) {
            lines.push(`${first ? label("paths") : continuation()}${name.padEnd(10, " ")}${value}`);
            first = false;
        }
        lines.push(`${continuation()}${"free".padEnd(10, " ")}${probe(() => freeSpace(paths.amethyst))}`);
    }

    appendRaw(`${lines.join("\n")}\n`);
}

/**
 * The second half of the header. Developer Mode, package registrations, .NET and the launcher's
 * own state all live behind renderer-side probes, so it lands once the window reports them, or
 * as `unknown` if the renderer never gets that far.
 */
export function writeMachineBlock(report: MachineReport | null): void {
    if (machineBlockWritten) return;
    machineBlockWritten = true;

    const lines: string[] = [];
    lines.push(`${label("appx")}${report?.appx ?? "unknown"}`);

    const registered = report?.registered ?? [];
    if (registered.length === 0) {
        lines.push(`${label("registered")}${report ? "none" : "unknown"}`);
    }
    else {
        registered.forEach((line, index) => lines.push(`${index === 0 ? label("registered") : continuation()}${line}`));
    }

    lines.push(`${label("dotnet")}${report?.dotnet ?? "unknown"}`);
    lines.push(`${label("state")}${report?.state ?? "unknown"}`);
    lines.push("=== end environment ===");

    appendRaw(`${lines.join("\n")}\n`);
}

function installGlobalHandlers(): void {
    process.on("uncaughtException", error => {
        mainLog("ERROR", "process", `uncaughtException: ${describeError(error)}`);
    });

    process.on("unhandledRejection", reason => {
        mainLog("ERROR", "process", `unhandledRejection: ${describeError(reason)}`);
    });

    // Nothing is coming from the renderer once it is gone, and nothing is coming at all once
    // the app is quitting, so those are the two moments the header has to settle for what it has.
    app.on("render-process-gone", (_event, _contents, details) => {
        mainLog("ERROR", "process", `render-process-gone: reason=${details.reason}, exitCode=${details.exitCode}`);
        writeMachineBlock(null);
    });

    app.on("child-process-gone", (_event, details) => {
        mainLog(
            "ERROR",
            "process",
            `child-process-gone: type=${details.type}, reason=${details.reason}, exitCode=${details.exitCode}`
            + `${details.name ? `, name=${details.name}` : ""}`
        );
    });

    app.on("before-quit", () => writeMachineBlock(null));
}

function installIpc(): void {
    const accept = (entry: unknown): void => {
        const value = entry as Partial<LogEntry> | null;
        if (!value || typeof value.message !== "string") return;
        writeEntry({
            time: typeof value.time === "number" ? value.time : Date.now(),
            source: typeof value.source === "string" ? value.source : "renderer",
            scope: typeof value.scope === "string" ? value.scope : "console",
            level: (value.level ?? "INFO") as LogLevel,
            message: value.message,
        });
    };

    ipcMain.on(LOG_IPC, (_event, entry) => accept(entry));

    // The renderer uses this for lines it may not survive to see written.
    ipcMain.on(LOG_IPC_SYNC, (event, entry) => {
        try {
            accept(entry);
        } finally {
            event.returnValue = true;
        }
    });

    ipcMain.on(LOG_IPC_ENVIRONMENT, (_event, report) => writeMachineBlock(report as MachineReport));

    ipcMain.on(LOG_IPC_PATH, event => {
        event.returnValue = logFile;
    });
}

try {
    fs.mkdirSync(logsDir, { recursive: true });
    rotate();
} catch {
    writable = false;
}

writeHeader();
installConsoleForwarder((level, message) => mainLog(level, "console", message));
installGlobalHandlers();
installIpc();
setTimeout(() => writeMachineBlock(null), MACHINE_BLOCK_TIMEOUT_MS).unref();
