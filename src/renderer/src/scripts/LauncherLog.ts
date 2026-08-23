import { writeLauncherLog } from "@renderer/scripts/diagnostics/RendererLog";

/**
 * Sits beside the runtime's own logs so the Logs page lists it and a tester can hand the
 * whole folder over. The launcher's diagnostics used to exist only in the DevTools console,
 * which nobody on a playtest machine ever opens.
 */
export function log(scope: string, message: string): void {
    writeLauncherLog("INFO", scope, message);
}

/** Multi-line detail (PowerShell error text, command output) indented under its own heading. */
export function logBlock(scope: string, heading: string, body: string): void {
    const indented = body
        .trim()
        .split(/\r?\n/)
        .map(l => `    ${l}`)
        .join("\n");
    log(scope, `${heading}\n${indented}`);
}
