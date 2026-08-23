import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

/**
 * The game caches its entitlement as `<titleId>.ent` in its data folder. Reported rather than
 * acted on: the launcher does not create, move or delete these, because an entitlement that came
 * in with adopted data is the one case where the file is present and the licence may not be.
 */
const reportedReadFailures = new Set<string>();

function entitlementFiles(dataDir: string): string[] {
    try {
        return fs.readdirSync(dataDir).filter(name => name.toLowerCase().endsWith(".ent"));
    } catch (e) {
        const key = `${dataDir}|${describeError(e)}`;
        if (!reportedReadFailures.has(key)) {
            reportedReadFailures.add(key);
            log("Licence", `${dataDir} could not be listed: ${describeError(e)}`);
        }
        return [];
    }
}

/** Each `.ent` with its size and when it was written, which is what says where it came from. */
export function describeEntitlements(dataDir: string): string {
    const files = entitlementFiles(dataDir);
    if (files.length === 0) return "none";

    return files
        .map(name => {
            try {
                const stat = fs.statSync(path.join(dataDir, name));
                return `${name} (${stat.size} bytes, written ${stat.mtime.toISOString()})`;
            } catch (e) {
                return `${name} (unreadable: ${describeError(e)})`;
            }
        })
        .join(", ");
}

export function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}
