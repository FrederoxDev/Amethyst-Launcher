import { log } from "@renderer/scripts/LauncherLog";
import { fetchWithTimeout } from "@renderer/scripts/Utility";
import { describeError } from "@shared/diagnostics/Log";
import { GithubRelease } from "./GithubRelease";

/** A release tag changes rarely; within one run the second lookup is answered from memory. */
const CACHE_TTL_MS = 10 * 60_000;

const ATTEMPTS = 2;
const RETRY_BACKOFF_MS = 500;

/** The fields of the GitHub releases API this reads, under their wire names. */
interface ReleasePayload {
    tag_name: string;
    assets?: {
        name: string;
        browser_download_url: string;
        size?: number;
    }[];
}

interface CachedRelease {
    release: GithubRelease;
    fetchedAt: number;
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** The unauthenticated allowance is 60 requests an hour per address, and NAT shares it. */
function rateLimitDetail(response: Response): string | null {
    if (response.headers.get("x-ratelimit-remaining") !== "0") return null;
    const reset = Number(response.headers.get("x-ratelimit-reset"));
    if (!Number.isFinite(reset) || reset <= 0) return "the GitHub request allowance is used up";
    const minutes = Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60_000));
    return `the GitHub request allowance is used up, it returns in about ${minutes} minute(s)`;
}

class RateLimitedError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "RateLimitedError";
    }
}

export class GithubTools {
    private static readonly cache = new Map<string, CachedRelease>();
    private static readonly inFlight = new Map<string, Promise<GithubRelease>>();

    /**
     * Returns the latest release of `repo`, from cache when it was read recently. A rate-limited
     * or unreachable GitHub falls back to whatever was cached earlier in the run, however old,
     * because a stale tag is worth more to the caller than no answer at all.
     */
    static async getLatestRelease(repo: string, timeout?: number): Promise<GithubRelease> {
        const cached = GithubTools.cache.get(repo);
        if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
            log("Github", `Latest release of ${repo} answered from cache: ${cached.release.tagName}`);
            return cached.release;
        }

        const running = GithubTools.inFlight.get(repo);
        if (running) {
            log("Github", `A lookup of ${repo} is already running, waiting on it`);
            return running;
        }

        const request = GithubTools.fetchLatestRelease(repo, timeout)
            .then(release => {
                GithubTools.cache.set(repo, { release, fetchedAt: Date.now() });
                return release;
            })
            .catch(error => {
                const stale = GithubTools.cache.get(repo);
                if (stale) {
                    log(
                        "Github",
                        `Falling back to the ${stale.release.tagName} record of ${repo} cached ` +
                            `${Math.round((Date.now() - stale.fetchedAt) / 1000)}s ago: ${describeError(error)}`
                    );
                    return stale.release;
                }
                throw error;
            })
            .finally(() => GithubTools.inFlight.delete(repo));

        GithubTools.inFlight.set(repo, request);
        return request;
    }

    private static async fetchLatestRelease(repo: string, timeout?: number): Promise<GithubRelease> {
        const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
        let lastError: unknown;

        for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
            const startedAt = Date.now();
            try {
                return await GithubTools.readRelease(apiUrl, timeout, startedAt);
            } catch (error) {
                lastError = error;
                log("Github", `Could not read the latest release of ${repo} from ${apiUrl}: ${describeError(error)}`);
                // Waiting out an hour-long allowance is not a retry, it is a hang.
                if (error instanceof RateLimitedError || attempt === ATTEMPTS) throw error;
                await delay(RETRY_BACKOFF_MS * attempt);
            }
        }

        throw lastError;
    }

    private static async readRelease(
        apiUrl: string,
        timeout: number | undefined,
        startedAt: number
    ): Promise<GithubRelease> {
        const response = timeout ? await fetchWithTimeout(apiUrl, {}, timeout) : await fetch(apiUrl);
        if (!response.ok) {
            const rateLimited = rateLimitDetail(response);
            const message =
                `GitHub API error: ${response.status} ${response.statusText}` +
                ` after ${Date.now() - startedAt}ms${rateLimited ? `, ${rateLimited}` : ""}`;
            throw rateLimited ? new RateLimitedError(message) : new Error(message);
        }

        const data = (await response.json()) as ReleasePayload;

        const release: GithubRelease = {
            tagName: data.tag_name,
            assets: (data.assets ?? []).map(asset => ({
                name: asset.name,
                downloadUrl: asset.browser_download_url,
                size: typeof asset.size === "number" ? asset.size : 0,
            })),
        };

        log(
            "Github",
            `GET ${apiUrl} returned ${response.status} in ${Date.now() - startedAt}ms: ` +
                `latest is ${release.tagName} with ${release.assets.length} assets ` +
                `(${release.assets.map(a => a.name).join(", ") || "none"})`
        );
        return release;
    }
}
