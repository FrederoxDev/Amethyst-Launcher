const fs = window.require("fs") as typeof import("fs");

import { DownloadProgress } from "@renderer/scripts/backend/Progress";
import { log } from "@renderer/scripts/LauncherLog";

type WriteStream = import("fs").WriteStream;

/** Suffix used while bytes are still arriving, so a partial file is never mistaken for a complete one. */
export const PART_SUFFIX = ".part";

function describe(error: unknown): string {
    if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code ? `${error.message} (${code})` : error.message;
    }
    return String(error);
}

function once(stream: WriteStream, event: "drain" | "close"): Promise<void> {
    return new Promise(resolve => stream.once(event, () => resolve()));
}

/**
 * Wraps a write stream so a write error is never an unhandled event: it is captured once and
 * re-thrown from whichever await is outstanding, including a flush error raised after the last write.
 */
class GuardedWriteStream {
    readonly stream: WriteStream;
    private failure: Promise<never>;

    constructor(path: string) {
        this.stream = fs.createWriteStream(path);
        let fail: (error: Error) => void = () => {};
        this.failure = new Promise<never>((_, reject) => (fail = reject));
        this.failure.catch(() => {});
        this.stream.once("error", error => {
            // Logged here as well as re-thrown: a write that fails after the last await has
            // nowhere to be re-thrown from and would otherwise vanish.
            log("Download", `Writing "${path}" failed: ${describe(error)}`);
            fail(error);
        });
    }

    async write(chunk: Uint8Array): Promise<void> {
        if (this.stream.write(chunk)) return;
        await Promise.race([once(this.stream, "drain"), this.failure]);
    }

    /** Ends the stream and resolves only once the fd is flushed and closed, so a late ENOSPC surfaces. */
    async finish(): Promise<void> {
        const closed = once(this.stream, "close");
        this.stream.end();
        await Promise.race([closed, this.failure]);
    }

    destroy(): void {
        this.stream.destroy();
    }
}

export class Downloader {
    /**
     * Streams `from` to `to`, writing through a `.part` file that is renamed only after the
     * full body has been received and flushed. Throws on any failure; there is no success flag.
     */
    static async downloadFile(
        from: string,
        to: string,
        onProgress: DownloadProgress = () => {},
        signal?: AbortSignal
    ): Promise<void> {
        const startedAt = Date.now();
        log("Download", `GET ${from} to "${to}"`);

        let response: Response;
        try {
            response = await fetch(from, { signal });
        } catch (error) {
            log("Download", `GET ${from} never answered after ${Date.now() - startedAt}ms: ${describe(error)}`);
            throw new Error(`Download of ${from} failed: ${describe(error)}`, { cause: error });
        }

        if (!response.ok) {
            log("Download", `GET ${from} returned ${response.status} ${response.statusText}`);
            throw new Error(`Download failed: ${from} returned ${response.status} ${response.statusText}`);
        }

        if (!response.body) {
            log("Download", `GET ${from} returned ${response.status} with no response body`);
            throw new Error(`Download failed: ${from} returned ${response.status} with no content.`);
        }

        const expectedSize = parseInt(response.headers.get("Content-Length") || "0", 10);
        log(
            "Download",
            `GET ${from} returned ${response.status}, `
            + `${expectedSize > 0 ? `${expectedSize} bytes` : "no declared length"}, `
            + `type ${response.headers.get("Content-Type") ?? "unstated"}`
        );

        const partPath = to + PART_SUFFIX;
        try {
            await fs.promises.rm(partPath, { force: true });
        } catch (error) {
            log("Download", `Could not clear the leftover part file "${partPath}": ${describe(error)}`);
            throw new Error(`Could not start the download of ${from}: ${describe(error)}`, { cause: error });
        }

        const reader = response.body.getReader();
        const out = new GuardedWriteStream(partPath);
        let received = 0;

        try {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                received += value.length;
                onProgress(received, expectedSize);
                await out.write(value);
            }

            await out.finish();

            if (expectedSize > 0 && received !== expectedSize) {
                throw new Error(`the connection closed after ${received} of ${expectedSize} bytes`);
            }

            const written = (await fs.promises.stat(partPath)).size;
            if (written !== received) {
                throw new Error(`only ${written} of ${received} bytes reached disk at "${partPath}"`);
            }
        } catch (error) {
            out.destroy();
            await fs.promises.rm(partPath, { force: true }).catch(cleanupError => {
                log("Download", `Could not delete the failed part file "${partPath}": ${describe(cleanupError)}`);
            });
            log(
                "Download",
                `Download of ${from} to "${to}" failed after ${received} of `
                + `${expectedSize > 0 ? expectedSize : "an unstated number of"} bytes `
                + `(HTTP ${response.status} ${response.statusText}, ${Date.now() - startedAt}ms): ${describe(error)}`
            );
            throw new Error(`Download of ${from} failed: ${describe(error)}`, { cause: error });
        } finally {
            reader.releaseLock();
        }

        try {
            await fs.promises.rename(partPath, to);
        } catch (error) {
            await fs.promises.rm(partPath, { force: true }).catch(cleanupError => {
                log("Download", `Could not delete the part file "${partPath}": ${describe(cleanupError)}`);
            });
            log("Download", `Could not move "${partPath}" to "${to}": ${describe(error)}`);
            throw new Error(`Could not save the download to "${to}": ${describe(error)}`, { cause: error });
        }

        log("Download", `Saved ${received} bytes from ${from} to "${to}" in ${Date.now() - startedAt}ms`);
    }
}
