import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";

const readmeCache = new Map<string, string>();

export function cachedReadme(githubUrl: string): string | undefined {
    return readmeCache.get(githubUrl);
}

export function invalidateReadmes(): void {
    readmeCache.clear();
}

function rawReadmeUrl(githubUrl: string, branch: string): string {
    const base = githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "");
    return `${base}/${branch}/README.md`;
}

/** The repository's README, or a short placeholder when it has none the launcher can read. */
export async function fetchReadme(githubUrl: string): Promise<string> {
    const cached = readmeCache.get(githubUrl);
    if (cached !== undefined) return cached;

    for (const branch of ["main", "master"]) {
        const url = rawReadmeUrl(githubUrl, branch);
        try {
            const response = await fetch(url);
            if (!response.ok) {
                log("ModDiscovery", `README at ${url} answered ${response.status} ${response.statusText}`);
                continue;
            }
            const text = await response.text();
            readmeCache.set(githubUrl, text);
            return text;
        } catch (e) {
            log("ModDiscovery", `README at ${url} could not be loaded: ${describeError(e)}`);
        }
    }

    const fallback = "README could not be loaded.";
    readmeCache.set(githubUrl, fallback);
    return fallback;
}
