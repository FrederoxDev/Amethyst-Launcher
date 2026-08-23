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

/**
 * A runaway render loop pipes megabytes a second through the console forwarder. Past this the
 * run is unreadable, unuploadable, and the only thing worth keeping is that it happened.
 */
const MAX_RUN_BYTES = 64 * 1024 * 1024;

const LABEL_WIDTH = 12;

export interface MachineReport {
    appx: string;
    registered: string[];
    state: string;
}

const startedAt = Date.now();
const logsDir = path.join(app.getPath("appData"), "Amethyst", "Launcher", "Logs");
const logFile = path.join(logsDir, `launcher_${fileStamp(startedAt)}.log`);

let writable = true;
let capped = false;
let bytesWritten = 0;
let runDiscarded = false;

/**
 * A Windows profile folder is the user's real name, and these files get pasted into public
 * Discord threads. Matching every separator spelling keeps the path readable as a path.
 */
const homePattern = ((): RegExp | null => {
    const home = probeValue(() => os.homedir(), "");
    const parts = home.split(/[\\/]/).filter(part => part !== "");
    if (home.length < 4 || parts.length < 2) return null;
    const escaped = parts.map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    return new RegExp(escaped.join("[\\\\/]"), "gi");
})();

function redactHome(text: string): string {
    return homePattern === null ? text : text.replace(homePattern, "%USERPROFILE%");
}

function write(text: string): void {
    try {
        fs.appendFileSync(logFile, text, "utf-8");
        bytesWritten += Buffer.byteLength(text, "utf-8");
    } catch {
        // A full or read-only disk must not take the launcher down with it.
        writable = false;
    }
}

function appendRaw(text: string): void {
    if (!writable || capped) return;

    const payload = redactHome(text);
    if (bytesWritten + Buffer.byteLength(payload, "utf-8") > MAX_RUN_BYTES) {
        capped = true;
        write(`${formatEntry({
            time: Date.now(),
            source: "main",
            scope: "log",
            level: "ERROR",
            message: `Log reached its ${formatBytes(MAX_RUN_BYTES)} cap; the rest of this run is not recorded.`,
        })}\n`);
        return;
    }

    write(payload);
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
    runDiscarded = true;
    environmentState = "settled";
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

    const current = path.basename(logFile);
    const files = entries.filter(name => /^launcher_.*\.log$/i.test(name)).sort();
    const stale = files.slice(0, Math.max(0, files.length - KEEP_RUNS));

    for (const name of stale) {
        if (name === current) continue;
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

type EnvironmentState = "pending" | "placeholder" | "reported" | "settled";

let environmentState: EnvironmentState = "pending";
let environmentSignature = "";

/**
 * The second half of the header. Developer Mode, package registrations, .NET and the launcher's
 * own state all live behind renderer-side probes, so it lands once the window reports them, or
 * as `unknown` if the renderer never gets that far.
 *
 * A machine slow enough to miss the timeout is the machine whose environment matters most, so a
 * real report supersedes the placeholder, and a later report that differs is written again:
 * turning Developer Mode on mid-session is exactly the state change the log has to show.
 */
export function writeMachineBlock(report: MachineReport | null): void {
    if (environmentState === "settled") return;

    if (report === null) {
        if (environmentState !== "pending") return;
        environmentState = "placeholder";
    }
    else {
        const signature = JSON.stringify(report);
        if (signature === environmentSignature) return;
        environmentSignature = signature;
        environmentState = "reported";
    }

    const lines: string[] = ["=== environment ==="];
    lines.push(`${label("appx")}${report?.appx ?? "unknown"}`);

    const registered = report?.registered ?? [];
    if (registered.length === 0) {
        lines.push(`${label("registered")}${report ? "none" : "unknown"}`);
    }
    else {
        registered.forEach((line, index) => lines.push(`${index === 0 ? label("registered") : continuation()}${line}`));
    }
    lines.push(`${label("state")}${report?.state ?? "unknown"}`);
    lines.push("=== end environment ===");

    appendRaw(`${lines.join("\n")}\n`);
}

/** The payload crosses IPC from a renderer that may be mid-failure; the header still has to hold. */
function parseMachineReport(value: unknown): MachineReport | null {
    if (typeof value !== "object" || value === null) return null;

    const candidate = value as Partial<MachineReport>;
    if (typeof candidate.appx !== "string" || typeof candidate.state !== "string") return null;

    return {
        appx: candidate.appx,
        registered: Array.isArray(candidate.registered)
            ? candidate.registered.filter((line): line is string => typeof line === "string")
            : [],
        state: candidate.state,
    };
}

function installGlobalHandlers(): void {
    process.on("uncaughtException", error => {
        mainLog("ERROR", "process", `uncaughtException: ${describeError(error)}`);
    });

    process.on("unhandledRejection", reason => {
        mainLog("ERROR", "process", `unhandledRejection: ${describeError(reason)}`);
    });

    // Nothing is coming from a renderer that is gone, so the header writes what it has.
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

    // Nothing can still be learned about the machine once the app is on its way out.
    app.on("before-quit", () => {
        writeMachineBlock(null);
        environmentState = "settled";
    });
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

    ipcMain.on(LOG_IPC_ENVIRONMENT, (_event, report) => {
        const parsed = parseMachineReport(report);
        if (parsed === null) {
            mainLog("WARN", "log", "Environment report ignored: the renderer sent a payload of the wrong shape");
            return;
        }
        writeMachineBlock(parsed);
    });

    ipcMain.on(LOG_IPC_PATH, event => {
        event.returnValue = logFile;
    });
}

try {
    fs.mkdirSync(logsDir, { recursive: true });
} catch {
    writable = false;
}

writeHeader();

/**
 * A second instance hands its argv over and quits before `ready`, so rotating here is what keeps
 * a deep link or a double-clicked `.amethyst` file from spending a rotation slot on a run that
 * never happened.
 */
app.whenReady().then(() => {
    if (runDiscarded) return;
    rotate();
}).catch(() => {
    // The app is not starting; the old logs surviving one more run is the least of it.
});

installConsoleForwarder((level, message) => mainLog(level, "console", message));
installGlobalHandlers();
installIpc();
setTimeout(() => writeMachineBlock(null), MACHINE_BLOCK_TIMEOUT_MS).unref();
