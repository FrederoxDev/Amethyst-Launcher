/** `globalThis.require` rather than `window.require`, so this file also compiles for the main process. */
const child = (globalThis as unknown as { require: NodeRequire }).require(
    "child_process"
) as typeof import("child_process");

export interface ProcessResult {
    command: string;
    args: string[];
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
    env?: NodeJS.ProcessEnv;
    timeoutMs?: number;
    /** Called with each complete line of stdout and stderr as it arrives. */
    onLine?: (line: string) => void;
}

export const DEFAULT_TIMEOUT_MS = 60_000;

/** How long a killed process gets to die politely before it is killed outright. */
const KILL_GRACE_MS = 2_000;

export function describeError(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

    return new Promise<ProcessResult>(resolve => {
        // One reader per stream: a shared one would splice a half-written stdout line onto the
        // next stderr line and report a message neither stream ever produced.
        const outReader = options.onLine ? makeLineReader(options.onLine) : null;
        const errReader = options.onLine ? makeLineReader(options.onLine) : null;
        let stdout = "";
        let stderr = "";
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

            const cleanStderr = stripClixml(stderr);
            resolve({
                command,
                args,
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
                env: options.env,
                windowsHide: true,
            });
        } catch (error) {
            settle(-1, describeError(error));
            return;
        }

        proc.stdout?.on("data", (data: Buffer | string) => {
            const text = data.toString();
            stdout += text;
            outReader?.push(text);
        });
        proc.stderr?.on("data", (data: Buffer | string) => {
            const text = data.toString();
            stderr += text;
            errReader?.push(text);
        });

        proc.on("error", error => {
            spawnError = describeError(error);
            settle(-1);
        });
        proc.on("close", code => settle(code ?? -1));

        timers.push(setTimeout(() => {
            timedOut = true;
            proc.kill();
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

    const command = [result.command, ...result.args.map(abbreviate)].join(" ");
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
