import { app, protocol } from "electron";
import * as fs from "fs";
import * as path from "path";

import { describeError } from "../../shared/diagnostics/Log";
import { mainLog } from "../diagnostics/LogWriter";

export const ICON_SCHEME = "amethyst-icon";

const MIME_TYPES: Record<string, string> = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
    ".ico": "image/x-icon",
    ".svg": "image/svg+xml",
};

function amethystRoot(): string {
    const appData = process.env.APPDATA ?? app.getPath("appData");
    return path.resolve(path.join(appData, "Amethyst"));
}

/** True only for a path that lands strictly inside the Amethyst folder. */
function insideRoot(root: string, target: string): boolean {
    const relative = path.relative(root, target);
    return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function notFound(): Response {
    return new Response(null, { status: 404 });
}

/** Must run before the app is ready, or the scheme is registered too late to be privileged. */
export function registerIconScheme(): void {
    protocol.registerSchemesAsPrivileged([
        { scheme: ICON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
    ]);
}

/**
 * Serves image files out of `%APPDATA%\Amethyst` so the renderer never needs a `file://` URL.
 * A mod supplies the path, so anything outside that folder is refused.
 */
export function serveIcons(): void {
    const root = amethystRoot();
    mainLog("INFO", "protocol", `Serving ${ICON_SCHEME}:// from ${root}`);

    protocol.handle(ICON_SCHEME, async request => {
        let target: string;
        try {
            target = path.resolve(decodeURIComponent(new URL(request.url).pathname.slice(1)));
        } catch (e) {
            mainLog(
                "WARN",
                "protocol",
                `Refusing ${request.url}: it does not carry a readable path (${describeError(e)})`
            );
            return notFound();
        }

        if (!insideRoot(root, target)) {
            mainLog("WARN", "protocol", `Refusing ${target}: it is not inside ${root}`);
            return notFound();
        }

        try {
            const contents = await fs.promises.readFile(target);
            const type = MIME_TYPES[path.extname(target).toLowerCase()] ?? "application/octet-stream";
            return new Response(new Uint8Array(contents), { headers: { "content-type": type } });
        } catch (e) {
            mainLog("WARN", "protocol", `Cannot serve ${target}: ${describeError(e)}`);
            return notFound();
        }
    });
}
