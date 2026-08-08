export type LogLevel = "INFO" | "WARN" | "ERROR" | "DEBUG";

export interface LogEntry {
    /** Stamped where the line was produced, so renderer lines keep their real order. */
    time: number;
    source: string;
    scope: string;
    level: LogLevel;
    message: string;
}

export const LOG_IPC = "LAUNCHER_LOG";
export const LOG_IPC_SYNC = "LAUNCHER_LOG_SYNC";
export const LOG_IPC_ENVIRONMENT = "LAUNCHER_LOG_ENVIRONMENT";
export const LOG_IPC_PATH = "LAUNCHER_LOG_PATH";

function pad(value: number, width: number): string {
    return value.toString().padStart(width, "0");
}

export function clockStamp(time: number): string {
    const d = new Date(time);
    return `${pad(d.getHours(), 2)}:${pad(d.getMinutes(), 2)}:${pad(d.getSeconds(), 2)}.${pad(d.getMilliseconds(), 3)}`;
}

/** Matches the runtime's own log file naming so both sort together in the Logs list. */
export function fileStamp(time: number): string {
    const d = new Date(time);
    return (
        `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`
        + `_${pad(d.getHours(), 2)}-${pad(d.getMinutes(), 2)}-${pad(d.getSeconds(), 2)}`
    );
}

/** `HH:MM:SS.mmm [source] [scope] [LEVEL] message`, with the tag omitted for INFO as the runtime does. */
export function formatEntry(entry: LogEntry): string {
    const tag = entry.level === "INFO" ? "" : ` [${entry.level}]`;
    return `${clockStamp(entry.time)} [${entry.source}] [${entry.scope}]${tag} ${entry.message}`;
}

export function describeError(value: unknown): string {
    if (value instanceof Error) {
        const stack = value.stack ?? `${value.name}: ${value.message}`;
        const cause = (value as { cause?: unknown }).cause;
        return cause === undefined ? stack : `${stack}\ncaused by: ${describeError(cause)}`;
    }
    return describeValue(value);
}

function describeValue(value: unknown): string {
    if (typeof value === "string") return value;
    if (value instanceof Error) return describeError(value);
    if (value === null) return "null";
    if (value === undefined) return "undefined";
    if (typeof value !== "object") return String(value);

    const seen = new WeakSet<object>();
    try {
        return JSON.stringify(value, (_key, inner) => {
            if (inner instanceof Error) return describeError(inner);
            if (typeof inner === "object" && inner !== null) {
                if (seen.has(inner)) return "[circular]";
                seen.add(inner);
            }
            if (typeof inner === "bigint") return inner.toString();
            return inner;
        }) ?? String(value);
    } catch {
        return String(value);
    }
}

/**
 * React and Node both log through `console.error("%s ...", value)`, so a logger that ignores
 * format specifiers writes the placeholders out literally and leaves the values dangling.
 */
export function formatArgs(args: unknown[]): string {
    if (args.length === 0) return "";

    const [first, ...rest] = args;
    if (typeof first !== "string" || !/%[sdifoOjc%]/.test(first)) {
        return args.map(describeValue).join(" ");
    }

    let next = 0;
    const filled = first.replace(/%([sdifoOjc%])/g, (match, kind: string) => {
        if (kind === "%") return "%";
        if (next >= rest.length) return match;
        const value = rest[next++];
        if (kind === "c") return "";
        if (kind === "d" || kind === "i") return String(Math.trunc(Number(value)));
        if (kind === "f") return String(Number(value));
        return describeValue(value);
    });

    return [filled, ...rest.slice(next).map(describeValue)].join(" ").trim();
}

type ForwardedLevel = "log" | "warn" | "error";

const originals: Partial<Record<ForwardedLevel, (...args: unknown[]) => void>> = {};
let forwarderInstalled = false;

/**
 * Turns every existing `console.*` call in the app into a log line without touching the call
 * sites. The original is still invoked, so DevTools keeps working.
 */
export function installConsoleForwarder(sink: (level: LogLevel, message: string) => void): void {
    if (forwarderInstalled) return;
    forwarderInstalled = true;

    const levels: ForwardedLevel[] = ["log", "warn", "error"];
    for (const level of levels) {
        const original = console[level].bind(console) as (...args: unknown[]) => void;
        originals[level] = original;
        console[level] = (...args: unknown[]) => {
            original(...args);
            try {
                sink(level === "log" ? "INFO" : level === "warn" ? "WARN" : "ERROR", formatArgs(args));
            } catch {
                // A logging failure must never turn into a second logging failure.
            }
        };
    }
}

/** Writes to the console the forwarder replaced, so deliberate log calls are not recorded twice. */
export function echoToConsole(level: LogLevel, message: string): void {
    const target: ForwardedLevel = level === "ERROR" ? "error" : level === "WARN" ? "warn" : "log";
    (originals[target] ?? console[target].bind(console))(message);
}
