import { log } from "@renderer/scripts/LauncherLog";
import { fetchWithTimeout } from "@renderer/scripts/Utility";
import { describeError } from "@shared/diagnostics/ProcessRunner";
import { GithubRelease } from "./GithubRelease";

export class GithubTools {
    static async getLatestRelease(repo: string, timeout?: number): Promise<GithubRelease> {
        const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
        const startedAt = Date.now();

        try {
            const response = timeout ? await fetchWithTimeout(apiUrl, {}) : await fetch(apiUrl);
            if (!response.ok) {
                const rateLimited = response.headers.get("x-ratelimit-remaining") === "0";
                throw new Error(
                    `GitHub API error: ${response.status} ${response.statusText}`
                    + ` after ${Date.now() - startedAt}ms${rateLimited ? ", the request allowance is used up" : ""}`
                );
            }

            const data = await response.json();

            const release: GithubRelease = {
                tagName: data.tag_name,
                assets: data.assets.map((asset: any) => ({
                    name: asset.name,
                    downloadUrl: asset.browser_download_url
                }))
            };

            log(
                "Github",
                `GET ${apiUrl} returned ${response.status} in ${Date.now() - startedAt}ms: `
                + `latest is ${release.tagName} with ${release.assets.length} assets `
                + `(${release.assets.map(a => a.name).join(", ") || "none"})`
            );
            return release;
        } catch (error) {
            log("Github", `Could not read the latest release of ${repo} from ${apiUrl}: ${describeError(error)}`);
            throw error;
        }
    }
}