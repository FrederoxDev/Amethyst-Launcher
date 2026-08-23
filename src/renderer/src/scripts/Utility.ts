import { describeError } from "@shared/diagnostics/Log";
import { log, logBlock } from "./LauncherLog";

const { clearTimeout } = window.require("timers") as typeof import("timers");
const { ipcRenderer } = window.require("electron") as typeof import("electron");
const fs = window.require("fs") as typeof import("fs");

export function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(`Timeout reached! (timeout = ${timeout}ms)`), timeout);
    return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timer));
}

let appVersion: string | null = null;

/** The build stamped into every file this launcher writes. */
export function launcherVersion(): string {
    if (appVersion === null) {
        try {
            appVersion = ipcRenderer.sendSync("get-app-version-sync") as string;
        } catch (e) {
            appVersion = "unknown";
            log("Utility", `Could not read the launcher version for file stamps: ${describeError(e)}`);
        }
    }
    return appVersion;
}

/** Enough of a malformed file to see what happened to it, without pasting a whole database in. */
const SNIPPET_LIMIT = 600;

export type JsonRead<T> = { ok: true; value: T } | { ok: false; reason: string };

/**
 * Reads and parses an on-disk file. A bare `JSON.parse(readFileSync(...))` reports
 * "Unexpected token" and names neither the file nor what was in it, which is the difference
 * between a log that explains a failed run and one that needs a follow-up question.
 */
export function tryReadJsonFile<T = unknown>(scope: string, filePath: string): JsonRead<T> {
    let text: string;
    try {
        text = fs.readFileSync(filePath, "utf-8");
    } catch (e) {
        log(scope, `Could not read ${filePath}: ${describeError(e)}`);
        return { ok: false, reason: `it could not be read (${(e as Error).message})` };
    }

    try {
        return { ok: true, value: JSON.parse(text) as T };
    } catch (e) {
        logBlock(
            scope,
            `${filePath} is not valid JSON (${(e as Error).message}); ${text.length} bytes on disk, first ${Math.min(text.length, SNIPPET_LIMIT)}:`,
            text.slice(0, SNIPPET_LIMIT) || "(empty file)"
        );
        return { ok: false, reason: `it is not valid JSON (${(e as Error).message})` };
    }
}

/**
 * A half-written file is worse than no file, because the reader quarantines it and the user
 * loses everything it held. The rename is the only step that can be observed.
 */
export function writeJsonAtomic(filePath: string, body: unknown, indent = 4): void {
    const tmp = `${filePath}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(body, undefined, indent), "utf-8");
    fs.renameSync(tmp, filePath);
}

export interface FormatStamp {
    format: string;
    formatVersion: number;
    writtenBy: string;
}

export type StampState =
    /** Written by this schema. Read it normally. */
    | { state: "current"; stamp: FormatStamp }
    /** No stamp at all, so it predates stamping. Read it as the legacy shape and re-stamp on the next write. */
    | { state: "legacy" }
    /** Stamped, but by a schema this build does not read. */
    | { state: "mismatch"; reason: string };

/** The three fields every file this launcher writes carries, so drift is detectable on sight. */
export function stampFields(format: string, formatVersion: number): Record<string, unknown> {
    return { format, format_version: formatVersion, written_by: launcherVersion() };
}

/**
 * Compares the stamp a file carries against the one this build writes, and says so in the log
 * either way. A file written by a different launcher build is a branch to handle, not an
 * exception to discover halfway through validating it.
 */
export function inspectStamp(scope: string, filePath: string, raw: unknown, format: string, formatVersion: number): StampState {
    const expected = `"${format}" v${formatVersion}`;
    const object = typeof raw === "object" && raw !== null && !Array.isArray(raw)
        ? raw as Record<string, unknown>
        : null;

    const foundFormat = typeof object?.format === "string" ? object.format : null;
    const foundVersion = typeof object?.format_version === "number" ? object.format_version : null;
    const writtenBy = typeof object?.written_by === "string" ? object.written_by : null;

    if (foundFormat === null && foundVersion === null) {
        log(scope, `${filePath}: no format stamp, expected ${expected}; reading it as a file from an older launcher build`);
        return { state: "legacy" };
    }

    const found = `"${foundFormat ?? "unnamed"}" v${foundVersion ?? "unknown"}`
        + `${writtenBy ? `, written by launcher ${writtenBy}` : ""}`;

    if (foundFormat !== format || foundVersion !== formatVersion) {
        log(scope, `${filePath}: stamp is ${found}, this build reads ${expected}`);
        return { state: "mismatch", reason: `it is stamped ${found} and this launcher reads ${expected}` };
    }

    log(scope, `${filePath}: stamp is ${found}, matching ${expected}`);
    return { state: "current", stamp: { format, formatVersion, writtenBy: writtenBy ?? "unknown" } };
}

const startupNotices: string[] = [];

/** Plain sentences for the user about anything that was quarantined while starting up. */
export function recordStartupNotice(message: string): void {
    startupNotices.push(message);
}

export function takeStartupNotices(): string[] {
    return startupNotices.splice(0, startupNotices.length);
}

function timestampSuffix(): string {
    return new Date().toISOString().replace(/[:.]/g, "-");
}

/**
 * Anything the user created is renamed, never deleted. `what` names it in plain words, because
 * it reaches the user as well as the log.
 *
 * Returns whether the file was moved. A caller that keeps running over a file still sitting
 * where it was would overwrite the very data it could not read.
 */
export function quarantineFile(scope: string, filePath: string, what: string, reason: string): boolean {
    const target = `${filePath}.stale-${timestampSuffix()}`;
    try {
        fs.renameSync(filePath, target);
        log(scope, `Quarantined ${filePath} as ${target}, because ${reason}`);
        recordStartupNotice(
            `Your saved ${what} could not be read, so the launcher started without it. `
            + `The old file was kept as ${target}`
        );
        return true;
    } catch (e) {
        log(scope, `Could not move ${filePath} aside (${describeError(e)}); it stays in place. It was rejected because ${reason}`);
        recordStartupNotice(
            `Your saved ${what} could not be read, and the launcher could not move it aside, `
            + `so it started without it and will not save over ${filePath}`
        );
        return false;
    }
}

/**
 * A cache is whatever it can be re-fetched into, so an unreadable one is a cache miss and
 * nothing the user needs to hear about.
 */
export function discardCacheFile(scope: string, filePath: string, reason: string): void {
    try {
        fs.rmSync(filePath, { force: true });
        log(scope, `Deleted the cache ${filePath}, because ${reason}; it will be fetched again`);
    } catch (e) {
        log(scope, `Could not delete the cache ${filePath} (${describeError(e)}); ignoring it because ${reason}`);
    }
}
