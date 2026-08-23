import { net } from "electron";
import * as fs from "fs";

import { DownloadOutcome, DownloadRequest, HeadResponse, PART_SUFFIX } from "../../shared/net/DownloadIpc";
import { describeError } from "../../shared/diagnostics/Log";
import { mainLog } from "../diagnostics/LogWriter";

/** How long the server has to answer with headers before the attempt is abandoned. */
const DEFAULT_CONNECT_TIMEOUT_MS = 30_000;

/** How long a transfer may go without delivering a single byte before it counts as stalled. */
const DEFAULT_IDLE_TIMEOUT_MS = 60_000;

const DEFAULT_ATTEMPTS = 3;
const RETRY_BACKOFF_MS = 1_000;

const HEAD_TIMEOUT_MS = 30_000;

export type ProgressSink = (transferred: number, total: number) => void;

/** Marks a failure as worth another try, as opposed to a bad URL or a cancelled download. */
class RetryableDownloadError extends Error {
    constructor(message: string, options?: { cause?: unknown }) {
        super(message, options);
        this.name = "RetryableDownloadError";
    }
}

function abortError(message: string): Error {
    const error = new Error(message);
    error.name = "AbortError";
    return error;
}

function isAbort(error: unknown): boolean {
    for (let e: unknown = error; e instanceof Error; e = e.cause) {
        if (e.name === "AbortError") return true;
    }
    return false;
}

function describe(error: unknown): string {
    if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code ? `${error.message} (${code})` : error.message;
    }
    return String(error);
}

/** Electron types a response body as a bare emitter; at runtime it is a paused readable stream. */
function bodyOf(response: Electron.IncomingMessage): NodeJS.ReadableStream {
    return response as unknown as NodeJS.ReadableStream;
}

function headerValue(headers: Record<string, string | string[]>, name: string): string | null {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value === undefined) return null;
    return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Sends a HEAD and reports what came back. A request nothing answered is a result, not a throw. */
export function headRequest(url: string, timeoutMs: number = HEAD_TIMEOUT_MS): Promise<HeadResponse> {
    return new Promise<HeadResponse>(resolve => {
        const startedAt = Date.now();
        let settled = false;
        const request = net.request({ method: "HEAD", url });

        const answer = (response: Omit<HeadResponse, "ms">): void => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve({ ...response, ms: Date.now() - startedAt });
        };

        const timer = setTimeout(() => {
            request.abort();
            answer({
                ok: false,
                status: 0,
                statusText: "",
                contentLength: 0,
                error: `no answer within ${timeoutMs}ms`,
            });
        }, timeoutMs);

        request.on("response", response => {
            response.on("data", () => {});
            response.on("end", () => {});
            const status = response.statusCode;
            answer({
                ok: status >= 200 && status < 300,
                status,
                statusText: response.statusMessage,
                contentLength: parseInt(headerValue(response.headers, "content-length") ?? "0", 10) || 0,
                error: null,
            });
        });

        request.on("error", error => {
            answer({ ok: false, status: 0, statusText: "", contentLength: 0, error: describe(error) });
        });

        request.end();
    });
}

/**
 * One try at moving `url` onto disk. Bytes go to a `.part` file that is renamed only once the
 * whole body arrived and the file descriptor closed, so a partial file never looks finished.
 */
class Attempt {
    private settled = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private stallReason: string | null = null;
    private cancelled = false;
    private readonly request: Electron.ClientRequest;
    private response: Electron.IncomingMessage | null = null;
    private out: fs.WriteStream | null = null;
    private received = 0;
    private expected = 0;
    private status = 0;
    private statusText = "";
    private readonly startedAt = Date.now();
    private readonly partPath: string;
    private resolveRun: (bytes: number) => void = () => {};
    private rejectRun: (error: Error) => void = () => {};

    constructor(
        private readonly job: DownloadRequest,
        private readonly onProgress: ProgressSink,
        private readonly attemptNumber: number,
        private readonly attempts: number
    ) {
        this.partPath = job.destination + PART_SUFFIX;
        this.request = net.request({ method: "GET", url: job.url });
    }

    run(): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            this.resolveRun = resolve;
            this.rejectRun = reject;

            mainLog(
                "INFO",
                "download",
                `GET ${this.job.url} to "${this.job.destination}" (attempt ${this.attemptNumber} of ${this.attempts})`
            );

            this.request.on("response", response => this.onResponse(response));
            this.request.on("error", error => this.onRequestError(error));
            this.arm(this.job.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS, `${this.job.url} headers`);
            this.request.end();
        });
    }

    /** Ends the transfer as the user cancelling it, which no retry may undo. */
    cancel(): void {
        if (this.settled) return;
        this.cancelled = true;
        this.fail(abortError(`Download of ${this.job.url} was cancelled`));
    }

    private arm(timeoutMs: number, what: string): void {
        this.disarm();
        this.timer = setTimeout(() => {
            this.stallReason = `${what} produced nothing for ${timeoutMs}ms`;
            this.onStall(this.stallReason);
        }, timeoutMs);
    }

    private disarm(): void {
        if (this.timer === null) return;
        clearTimeout(this.timer);
        this.timer = null;
    }

    private onStall(reason: string): void {
        if (this.response === null) {
            mainLog(
                "ERROR",
                "download",
                `GET ${this.job.url} never answered after ${Date.now() - this.startedAt}ms: ${reason}`
            );
            this.fail(new RetryableDownloadError(`Download of ${this.job.url} failed: ${reason}`));
            return;
        }
        this.failTransfer(new RetryableDownloadError(reason));
    }

    private onRequestError(error: Error): void {
        if (this.settled) return;
        if (this.response === null) {
            const elapsed = Date.now() - this.startedAt;
            mainLog("ERROR", "download", `GET ${this.job.url} never answered after ${elapsed}ms: ${describe(error)}`);
            this.fail(
                new RetryableDownloadError(`Download of ${this.job.url} failed: ${describe(error)}`, { cause: error })
            );
            return;
        }
        this.failTransfer(error);
    }

    private onResponse(response: Electron.IncomingMessage): void {
        if (this.settled) return;
        this.disarm();
        this.response = response;
        this.status = response.statusCode;
        this.statusText = response.statusMessage;
        const body = bodyOf(response);
        body.pause();

        if (this.status < 200 || this.status >= 300) {
            mainLog("WARN", "download", `GET ${this.job.url} returned ${this.status} ${this.statusText}`);
            const message = `Download failed: ${this.job.url} returned ${this.status} ${this.statusText}`;
            // A 4xx other than 408/429 says the request itself is wrong; repeating it changes nothing.
            const retryable = this.status >= 500 || this.status === 408 || this.status === 429;
            this.fail(retryable ? new RetryableDownloadError(message) : new Error(message));
            return;
        }

        const declared = parseInt(headerValue(response.headers, "content-length") ?? "0", 10) || 0;
        this.expected = declared > 0 ? declared : (this.job.expectedBytes ?? 0);
        mainLog(
            "INFO",
            "download",
            `GET ${this.job.url} returned ${this.status}, ` +
                `${
                    declared > 0
                        ? `${declared} bytes`
                        : this.expected > 0
                          ? `no declared length, ${this.expected} bytes expected by the caller`
                          : "no declared length"
                }, ` +
                `type ${headerValue(response.headers, "content-type") ?? "unstated"}`
        );

        void this.startWriting(body);
    }

    private async startWriting(body: NodeJS.ReadableStream): Promise<void> {
        try {
            await fs.promises.rm(this.partPath, { force: true });
        } catch (error) {
            mainLog(
                "ERROR",
                "download",
                `Could not clear the leftover part file "${this.partPath}": ${describeError(error)}`
            );
            this.fail(
                new Error(`Could not start the download of ${this.job.url}: ${describe(error)}`, { cause: error })
            );
            return;
        }
        if (this.settled) return;

        const out = fs.createWriteStream(this.partPath);
        this.out = out;
        out.on("error", error => {
            mainLog("ERROR", "download", `Writing "${this.partPath}" failed: ${describeError(error)}`);
            this.failTransfer(error);
        });

        const idleTimeout = this.job.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
        body.on("data", (chunk: string | Buffer) => {
            if (this.settled) return;
            this.arm(idleTimeout, `${this.job.url}`);
            this.received += chunk.length;
            this.onProgress(this.received, this.expected);
            if (!out.write(chunk)) {
                body.pause();
                out.once("drain", () => {
                    if (!this.settled) body.resume();
                });
            }
        });
        body.on("error", error => this.failTransfer(error));
        body.on("end", () => this.onEnd());

        this.arm(idleTimeout, `${this.job.url}`);
        body.resume();
    }

    private onEnd(): void {
        if (this.settled) return;
        this.disarm();
        const out = this.out;
        if (out === null) return;

        // Renaming a file Windows still holds a handle to fails, so the close comes first.
        out.once("close", () => {
            if (this.settled) return;
            void this.finish();
        });
        out.end();
    }

    private async finish(): Promise<void> {
        try {
            if (this.expected > 0 && this.received !== this.expected) {
                throw new RetryableDownloadError(
                    `the connection closed after ${this.received} of ${this.expected} bytes`
                );
            }
            if (this.expected === 0 && this.received === 0) {
                throw new RetryableDownloadError("the response carried no bytes and declared no length");
            }

            const written = (await fs.promises.stat(this.partPath)).size;
            if (written !== this.received) {
                throw new Error(`only ${written} of ${this.received} bytes reached disk at "${this.partPath}"`);
            }
        } catch (error) {
            this.failTransfer(error);
            return;
        }

        try {
            await fs.promises.rename(this.partPath, this.job.destination);
        } catch (error) {
            await this.removePart();
            mainLog(
                "ERROR",
                "download",
                `Could not move "${this.partPath}" to "${this.job.destination}": ${describeError(error)}`
            );
            this.reject(
                new Error(`Could not save the download to "${this.job.destination}": ${describe(error)}`, {
                    cause: error,
                })
            );
            return;
        }

        this.onProgress(this.received, this.expected > 0 ? this.expected : this.received);
        mainLog(
            "INFO",
            "download",
            `Saved ${this.received} bytes from ${this.job.url} to "${this.job.destination}" ` +
                `in ${Date.now() - this.startedAt}ms`
        );
        this.disarm();
        this.settled = true;
        this.resolveRun(this.received);
    }

    /** A failure once the response existed: everything but a cancel is worth another attempt. */
    private failTransfer(error: unknown): void {
        if (this.settled) return;
        const failure = error instanceof Error ? error : new Error(String(error));

        mainLog(
            "ERROR",
            "download",
            `Download of ${this.job.url} to "${this.job.destination}" failed after ${this.received} of ` +
                `${this.expected > 0 ? this.expected : "an unstated number of"} bytes ` +
                `(HTTP ${this.status} ${this.statusText}, ${Date.now() - this.startedAt}ms): ${describeError(failure)}`
        );

        const wrapped = `Download of ${this.job.url} failed: ${describe(failure)}`;
        if (isAbort(failure)) this.fail(new Error(wrapped, { cause: failure }));
        else this.fail(new RetryableDownloadError(wrapped, { cause: failure }));
    }

    private fail(error: Error): void {
        if (this.settled) return;
        this.disarm();
        this.request.abort();
        this.out?.destroy();
        void this.removePart().then(() => this.reject(error));
    }

    private async removePart(): Promise<void> {
        if (this.out === null) return;
        await fs.promises.rm(this.partPath, { force: true }).catch(error => {
            mainLog("WARN", "download", `Could not delete the part file "${this.partPath}": ${describeError(error)}`);
        });
    }

    private reject(error: Error): void {
        if (this.settled) return;
        this.settled = true;
        this.rejectRun(this.cancelled && !isAbort(error) ? abortError(error.message) : error);
    }
}

/** Waits out a retry backoff, cutting it short once the download has been cancelled. */
function backoffDelay(ms: number, cancelSignal: { cancelled: boolean }): Promise<void> {
    return new Promise(resolve => {
        const poll = setInterval(() => {
            if (!cancelSignal.cancelled) return;
            clearInterval(poll);
            clearTimeout(waiter);
            resolve();
        }, 100);
        const waiter = setTimeout(() => {
            clearInterval(poll);
            resolve();
        }, ms);
    });
}

/**
 * Runs a transfer to completion, retrying a stall, a dropped connection or a server having a bad
 * minute. Cancelling stops it for good and is reported as an abort rather than a failure, so the
 * caller can tell the two apart.
 */
export class Download {
    private attempt: Attempt | null = null;
    private readonly cancelSignal = { cancelled: false };

    constructor(
        private readonly request: DownloadRequest,
        private readonly onProgress: ProgressSink
    ) {}

    cancel(): void {
        this.cancelSignal.cancelled = true;
        this.attempt?.cancel();
    }

    async run(): Promise<DownloadOutcome> {
        const attempts = Math.max(1, this.request.attempts ?? DEFAULT_ATTEMPTS);

        for (let attempt = 1; attempt <= attempts; attempt++) {
            if (this.cancelSignal.cancelled) {
                return { kind: "aborted", message: `Download of ${this.request.url} was cancelled` };
            }

            this.attempt = new Attempt(this.request, this.onProgress, attempt, attempts);
            try {
                const bytes = await this.attempt.run();
                return { kind: "done", bytes };
            } catch (error) {
                if (isAbort(error)) return { kind: "aborted", message: describe(error) };
                if (!(error instanceof RetryableDownloadError) || attempt === attempts) {
                    return { kind: "failed", message: describe(error) };
                }
                const backoff = RETRY_BACKOFF_MS * attempt;
                mainLog(
                    "WARN",
                    "download",
                    `Attempt ${attempt} of ${attempts} for ${this.request.url} failed, ` +
                        `retrying in ${backoff}ms: ${describe(error)}`
                );
                await backoffDelay(backoff, this.cancelSignal);
            }
        }

        return { kind: "failed", message: `Download of ${this.request.url} failed after ${attempts} attempts.` };
    }
}
