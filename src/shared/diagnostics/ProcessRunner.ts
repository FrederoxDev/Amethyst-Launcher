/** `globalThis.require` rather than `window.require`, so this file also compiles for the main process. */
const child = (globalThis as unknown as { require: NodeRequire }).require(
    "child_process"
) as typeof import("child_process");

export interface ProcessResult {
    command: string;
    args: string[];
    /**
     * `args` with any key material replaced, and the only form that may be written to a log.
     * Equal to `args` unless the caller supplied {@link RunOptions.redactArgs}.
     */
    loggableArgs: string[];
    /** `-1` when the process never started, or was killed before it could report a code. */
    code: number;
    stdout: string;
    stderr: string;
    /** stdout and stderr together, which is where failure text usually has to be read from. */
    output: string;
    durationMs: number;
    spawnError?: string;
    /** The run hit its deadline and was killed, so `code` says nothing about the work. */
    timedOut: boolean;
}

export interface RunOptions {
    cwd?: string;
    /** Merged over the launcher's own environment, never used in place of it. */
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    /** Called with each complete line of stdout and stderr as it arrives. */
    onLine?: (line: string) => void;
    /**
     * Rewrites the argument list before anything logs it. Redaction lives here rather than at
     * the call sites so a command line carrying a key cannot be logged by forgetting to.
     */
    redactArgs?: (args: string[]) => string[];
}

export const DEFAULT_TIMEOUT_MS = 60_000;

/** How long a killed process gets to die politely before it is killed outright. */
const KILL_GRACE_MS = 2_000;

/**
 * Per-stream character cap. A tool that logs a line per file walks into hundreds of megabytes
 * held in the renderer heap, and nothing downstream reads more than the tail of a failure.
 */
const MAX_STREAM_CHARS = 1_000_000;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

/**
 * Keeps the most recent {@link MAX_STREAM_CHARS} characters. The tail rather than the head:
 * the markers {@link readMarker} reads and a script's own error text are both written last.
 */
function makeCappedBuffer(): { push(text: string): void; value(): string } {
    let kept = "";
    let dropped = 0;

    return {
        push(text) {
            kept += text;
            if (kept.length > MAX_STREAM_CHARS) {
                const excess = kept.length - MAX_STREAM_CHARS;
                kept = kept.slice(excess);
                dropped += excess;
            }
        },
        value() {
            return dropped > 0 ? `...(${dropped} earlier characters dropped)\n${kept}` : kept;
        },
    };
}

/**
 * Kills the whole tree rather than the process we spawned. msiexec and powershell.exe do their
 * work in grandchildren that outlive the parent, keep holding the installer lock, and make the
 * retry fail with "another installation is in progress".
 */
function killTree(proc: import("child_process").ChildProcess): void {
    if (process.platform !== "win32" || proc.pid === undefined) {
        proc.kill();
        return;
    }

    child.execFile("taskkill", ["/T", "/F", "/PID", String(proc.pid)], { windowsHide: true }, error => {
        if (error) proc.kill();
    });
}

function decodeClixmlErrors(blob: string): string {
    const parts: string[] = [];
    for (const match of blob.matchAll(/<S S="Error">([\s\S]*?)<\/S>/g)) {
        parts.push(
            match[1]
                .replace(/_x000D_/g, "")
                .replace(/_x000A_/g, "\n")
                .replace(/&lt;/g, "<")
                .replace(/&gt;/g, ">")
                .replace(/&amp;/g, "&")
        );
    }
    return parts.join("").trim();
}

/**
 * powershell.exe serialises its progress stream onto stderr as a multi-kilobyte CLIXML blob.
 * It is noise, and left in it swamps the log and the message the user sees.
 *
 * The blob is only dropped when there is plain text to keep. A script that fails to parse never
 * reaches its own catch, so its one and only explanation is inside the blob, and "exit 1" with
 * no reason attached is the thing this file exists to prevent.
 */
function stripClixml(text: string): string {
    const start = text.search(/#<\s*CLIXML/);
    if (start < 0) return text.trim();

    const plain = text.slice(0, start).trim();
    return plain || decodeClixmlErrors(text.slice(start));
}

function makeLineReader(onLine: (line: string) => void): { push(text: string): void; flush(): void } {
    let rest = "";

    const emit = (line: string): void => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith("#< CLIXML")) onLine(trimmed);
    };

    return {
        push(text) {
            rest += text;
            const lines = rest.split(/\r?\n/);
            rest = lines.pop() ?? "";
            for (const line of lines) emit(line);
        },
        flush() {
            const last = rest;
            rest = "";
            emit(last);
        },
    };
}

/**
 * Runs a process to completion and reports what happened. Never rejects and never hangs:
 * a missing executable, a crash and a run that overstays its deadline all come back as a
 * `ProcessResult` the caller classifies.
 *
 * Arguments are always passed as a list. A command line assembled into one string has to be
 * taken apart again by something, and every taker-apart gets paths with spaces in them wrong.
 */
export function run(command: string, args: string[], options: RunOptions = {}): Promise<ProcessResult> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const startedAt = Date.now();
    const loggableArgs = options.redactArgs ? options.redactArgs(args) : args;

    return new Promise<ProcessResult>(resolve => {
        // One reader per stream: a shared one would splice a half-written stdout line onto the
        // next stderr line and report a message neither stream ever produced.
        const outReader = options.onLine ? makeLineReader(options.onLine) : null;
        const errReader = options.onLine ? makeLineReader(options.onLine) : null;
        const outBuffer = makeCappedBuffer();
        const errBuffer = makeCappedBuffer();
        let spawnError: string | undefined;
        let timedOut = false;
        let settled = false;
        const timers: ReturnType<typeof setTimeout>[] = [];

        const settle = (code: number, failure?: string): void => {
            if (settled) return;
            settled = true;
            for (const timer of timers) clearTimeout(timer);
            outReader?.flush();
            errReader?.flush();

            const stdout = outBuffer.value();
            const cleanStderr = stripClixml(errBuffer.value());
            resolve({
                command,
                args,
                loggableArgs,
                code,
                stdout,
                stderr: cleanStderr,
                output: [stdout.trim(), cleanStderr].filter(Boolean).join("\n"),
                durationMs: Date.now() - startedAt,
                spawnError: failure ?? spawnError,
                timedOut,
            });
        };

        let proc: import("child_process").ChildProcess;
        try {
            proc = child.spawn(command, args, {
                cwd: options.cwd,
                // Merged, not replaced: an env of just the caller's keys drops PATH and
                // SystemRoot, and spawn then fails with an ENOENT that names nothing.
                env: { ...process.env, ...options.env },
                // stdin is closed rather than piped, so a child that reads it sees EOF at once
                // instead of blocking until the deadline.
                stdio: ["ignore", "pipe", "pipe"],
                windowsHide: true,
            });
        } catch (error) {
            settle(-1, errorMessage(error));
            return;
        }

        proc.stdout?.on("data", (data: Buffer | string) => {
            const text = data.toString();
            outBuffer.push(text);
            outReader?.push(text);
        });
        proc.stderr?.on("data", (data: Buffer | string) => {
            const text = data.toString();
            errBuffer.push(text);
            errReader?.push(text);
        });

        proc.on("error", error => {
            spawnError = errorMessage(error);
            settle(-1);
        });
        proc.on("close", code => settle(code ?? -1));

        timers.push(setTimeout(() => {
            timedOut = true;
            killTree(proc);
            // Settles even if the kill does not take, so a wedged child can never wedge the caller.
            timers.push(setTimeout(() => {
                proc.kill("SIGKILL");
                settle(-1);
            }, KILL_GRACE_MS));
        }, timeoutMs));
    });
}

function abbreviate(arg: string): string {
    return arg.length > 120 ? `${arg.slice(0, 60)}...(${arg.length} chars)` : arg;
}

/** One block carrying everything needed to tell what a failed run did: command, outcome, output. */
export function describeResult(result: ProcessResult): string {
    const outcome = result.spawnError
        ? `could not start: ${result.spawnError}`
        : result.timedOut
            ? `timed out after ${result.durationMs}ms`
            : `exit ${result.code} in ${result.durationMs}ms`;

    const command = [result.command, ...result.loggableArgs.map(abbreviate)].join(" ");
    const body = result.output.trim();
    const detail = body ? `\n${body.split(/\r?\n/).map(line => `    ${line}`).join("\n")}` : "";
    return `${command}\n  ${outcome}${detail}`;
}

export function psQuote(value: string): string {
    return value.replace(/'/g, "''");
}

/**
 * Runs a PowerShell script body, always base64-encoded and always wrapped so a failure is
 * visible. Both halves matter: quoted `-Command` strings mangle paths and nested scripts, and
 * cmdlets report failures as non-terminating errors, so powershell.exe exits 0 while nothing
 * happened. `$ErrorActionPreference = 'Stop'` plus the explicit `exit 1` forces a real code,
 * and the markers give the caller something stable to read.
 */
export function runPowerShell(body: string, options: RunOptions = {}): Promise<ProcessResult> {
    const script =
        `$ErrorActionPreference = 'Stop'\n`
        + `try {\n`
        + `${body.trim().split("\n").map(line => `    ${line}`).join("\n")}\n`
        + `}\n`
        + `catch {\n`
        + `    Write-Output ('HRESULT=0x{0:X8}' -f $_.Exception.HResult)\n`
        + `    Write-Output ('ERRORID=' + $_.FullyQualifiedErrorId)\n`
        + `    Write-Output ('MESSAGE=' + ($_.Exception.Message -replace '\\r?\\n', ' '))\n`
        + `    exit 1\n`
        + `}\n`;

    const encoded = Buffer.from(script, "utf16le").toString("base64");
    return run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
        options
    );
}

/** Reads a `KEY=value` marker written by a script run through {@link runPowerShell}. */
export function readMarker(output: string, key: string): string | null {
    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed.startsWith(`${key}=`)) return trimmed.slice(key.length + 1);
    }
    return null;
}
