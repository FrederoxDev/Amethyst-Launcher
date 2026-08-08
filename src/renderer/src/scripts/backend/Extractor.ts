const fs = window.require("fs") as typeof import("fs");
const JSZip = window.require("jszip") as typeof import("jszip");

import { ExtractProgress } from "@renderer/scripts/backend/Progress";

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
        try {
            await fs.promises.mkdir(to, { recursive: true });
        } catch (error) {
            console.error(`[Extractor] Could not create destination "${to}".`, error);
            throw new Error(`Could not create the folder "${to}": ${describe(error)}`, { cause: error });
        }

        let zip: Awaited<ReturnType<typeof JSZip.loadAsync>>;
        try {
            const data = await fs.promises.readFile(file);
            zip = await JSZip.loadAsync(data);
        } catch (error) {
            console.error(`[Extractor] Could not read archive "${file}".`, error);
            throw new Error(`"${path.basename(file)}" is not a readable archive: ${describe(error)}`, { cause: error });
        }

        const excluded = new Set(excludes);
        const entries = Object.entries(zip.files).filter(([name, entry]) => !entry.dir && !excluded.has(name));

        const root = path.resolve(to);
        const targets = new Map<string, string>();
        for (const [name] of entries) {
            try {
                targets.set(name, resolveEntry(root, name));
            } catch (error) {
                console.error(`[Extractor] Rejected entry in "${file}".`, { entry: name, destination: to, error });
                throw new Error(`"${path.basename(file)}" is unsafe to extract: ${describe(error)}`, { cause: error });
            }
        }

        const total = entries.length;
        let extracted = 0;

        for (const [name, entry] of entries) {
            const target = targets.get(name)!;
            try {
                const data = await entry.async("uint8array");
                await fs.promises.mkdir(path.dirname(target), { recursive: true });
                await fs.promises.writeFile(target, data);
            } catch (error) {
                console.error(`[Extractor] Failed on entry "${name}".`, {
                    archive: file,
                    target,
                    extracted,
                    total,
                    error,
                });
                throw new Error(
                    `Could not extract "${name}" from "${path.basename(file)}" ` +
                    `(${extracted} of ${total} entries done): ${describe(error)}`,
                    { cause: error }
                );
            }

            extracted += 1;
            onProgress(extracted, total, name);
        }

        console.log(`[Extractor] Extracted ${extracted} entries from "${file}" to "${to}".`);
    }
}
