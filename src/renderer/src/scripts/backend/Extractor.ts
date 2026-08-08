const fs = window.require("fs") as typeof import("fs");
const JSZip = window.require("jszip") as typeof import("jszip");

import { ExtractProgress } from "@renderer/scripts/backend/Progress";
import { log } from "@renderer/scripts/LauncherLog";

const path = window.require("path") as typeof import("path");

function describe(error: unknown): string {
    if (error instanceof Error) {
        const code = (error as NodeJS.ErrnoException).code;
        return code ? `${error.message} (${code})` : error.message;
    }
    return String(error);
}

/**
 * Resolves a zip entry against the destination and refuses anything that escapes it.
 * `..\..\x` and `C:/x` both survive JSZip's own name handling, so this has to be checked here.
 */
function resolveEntry(root: string, filename: string): string {
    const target = path.resolve(root, filename);
    if (target !== root && !target.startsWith(root + path.sep)) {
        throw new Error(`archive entry "${filename}" points outside the destination folder`);
    }
    return target;
}

export class Extractor {
    /** Extracts every non-excluded entry of `file` into `to`. Throws naming the entry that failed. */
    static async extractFile(
        file: string,
        to: string,
        excludes: string[],
        onProgress: ExtractProgress = (): void => {}
    ): Promise<void> {
        const startedAt = Date.now();
        log("Extract", `Extracting "${file}" to "${to}"${excludes.length > 0 ? `, excluding ${excludes.join(", ")}` : ""}`);

        try {
            await fs.promises.mkdir(to, { recursive: true });
        } catch (error) {
            log("Extract", `Could not create the destination "${to}": ${describe(error)}`);
            throw new Error(`Could not create the folder "${to}": ${describe(error)}`, { cause: error });
        }

        let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
        let archiveBytes = 0;
        try {
            const data = await fs.promises.readFile(file);
            archiveBytes = data.length;
            zip = await JSZip.loadAsync(data);
        } catch (error) {
            log("Extract", `Could not read the archive "${file}": ${describe(error)}`);
            throw new Error(`"${path.basename(file)}" is not a readable archive: ${describe(error)}`, { cause: error });
        }

        const excluded = new Set(excludes);
        const all = Object.entries(zip.files);
        const entries = all.filter(([name, entry]) => !entry.dir && !excluded.has(name));
        log(
            "Extract",
            `"${file}" is ${archiveBytes} bytes holding ${all.length} entries, `
            + `${entries.length} of them files to write`
        );

        const root = path.resolve(to);
        const targets = new Map<string, string>();
        for (const [name] of entries) {
            try {
                targets.set(name, resolveEntry(root, name));
            } catch (error) {
                log("Extract", `Rejected entry "${name}" of "${file}" bound for outside "${to}": ${describe(error)}`);
                throw new Error(`"${path.basename(file)}" is unsafe to extract: ${describe(error)}`, { cause: error });
            }
        }

        const total = entries.length;
        let extracted = 0;
        let bytes = 0;

        // No line per entry: an msixvc holds tens of thousands of them. Only the total is logged.
        for (const [name, entry] of entries) {
            const target = targets.get(name)!;
            try {
                const data = await entry.async("uint8array");
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.writeFile(target, data);
                bytes += data.length;
            } catch (error) {
                log(
                    "Extract",
                    `Failed on entry "${name}" of "${file}" bound for "${target}" `
                    + `after ${extracted} of ${total} entries (${bytes} bytes): ${describe(error)}`
                );
                throw new Error(
                    `Could not extract "${name}" from "${path.basename(file)}" ` +
                    `(${extracted} of ${total} entries done): ${describe(error)}`,
                    { cause: error }
                );
            }

            extracted += 1;
            onProgress(extracted, total, name);
        }

        log("Extract", `Extracted ${extracted} entries (${bytes} bytes) from "${file}" to "${to}" in ${Date.now() - startedAt}ms`);
    }
}
