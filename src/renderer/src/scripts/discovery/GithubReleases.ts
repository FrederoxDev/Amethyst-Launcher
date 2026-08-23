import { isModArchive, modArchiveName } from "@renderer/flows/ImportMod";
import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";

export interface ModRelease {
    id: number;
    name: string;
    publishedAt: string;
    downloadName: string;
    downloadUrl: string;
}

interface GithubAsset {
    id: number;
    name: string;
    browser_download_url: string;
}

interface GithubRelease {
    id: number;
    name: string;
    tag_name: string;
    html_url: string;
    published_at: string;
    assets: GithubAsset[];
}

export interface GithubRepo {
    owner: string;
    repo: string;
}

export function parseGithubRepo(githubUrl: string): GithubRepo | null {
    const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
    if (!match) return null;
    return { owner: match[1], repo: match[2] };
}

const releasesCache = new Map<string, ModRelease[]>();

export function cachedReleases(githubUrl: string): ModRelease[] | undefined {
    return releasesCache.get(githubUrl);
}

export function invalidateReleases(): void {
    releasesCache.clear();
}

async function githubMessage(response: Response): Promise<string> {
    const body = await response.json().catch(() => null);
    const message = (body as { message?: unknown } | null)?.message;
    return typeof message === "string" ? message : "";
}

/** Turns a failed releases request into something the user can act on. */
async function releasesFailure(repo: GithubRepo, response: Response): Promise<Error> {
    const detail = await githubMessage(response);
    const rateLimited =
        (response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0";

    if (rateLimited) {
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const wait = Number.isFinite(reset) ? Math.max(1, Math.ceil((reset * 1000 - Date.now()) / 60000)) : 0;
        return new Error(
            "GitHub is rate-limiting this launcher, so the release list could not be read. " +
                (wait > 0 ? `Try again in about ${wait} minute(s).` : "Try again shortly.")
        );
    }

    if (response.status === 404) {
        return new Error(
            `The repository ${repo.owner}/${repo.repo} does not exist or is private, so its releases could not be read.`
        );
    }

    return new Error(
        `GitHub answered ${response.status} ${response.statusText} for ${repo.owner}/${repo.repo}'s releases.`,
        { cause: detail === "" ? undefined : new Error(detail) }
    );
}

/**
 * Releases of `githubUrl` that carry an installable mod archive. Throws with a message written
 * for the user; an empty array means the repository genuinely publishes nothing installable.
 */
export async function fetchReleases(githubUrl: string): Promise<ModRelease[]> {
    const cached = releasesCache.get(githubUrl);
    if (cached) return cached;

    const repo = parseGithubRepo(githubUrl);
    if (!repo) {
        log("ModDiscovery", `No releases for "${githubUrl}": it is not a github.com/owner/repo URL`);
        throw new Error(`"${githubUrl}" is not a GitHub repository link, so its releases cannot be listed.`);
    }

    let response: Response;
    try {
        response = await fetch(`https://api.github.com/repos/${repo.owner}/${repo.repo}/releases`);
    } catch (e) {
        log("ModDiscovery", `Requesting the releases of ${githubUrl} failed: ${describeError(e)}`);
        throw new Error(
            `Could not reach GitHub to list the releases of ${repo.owner}/${repo.repo}. Check your internet connection.`,
            { cause: e }
        );
    }

    if (!response.ok) {
        const failure = await releasesFailure(repo, response);
        log("ModDiscovery", `Reading the releases of ${githubUrl} failed: ${describeError(failure)}`);
        throw failure;
    }

    const data = await response.json().catch(e => {
        log("ModDiscovery", `The releases of ${githubUrl} were not readable JSON: ${describeError(e)}`);
        throw new Error(`GitHub's answer for ${repo.owner}/${repo.repo}'s releases could not be read.`, { cause: e });
    });

    if (!Array.isArray(data)) {
        log("ModDiscovery", `The releases of ${githubUrl} came back as ${typeof data}, not a list`);
        throw new Error(`GitHub did not return a release list for ${repo.owner}/${repo.repo}.`);
    }

    const releases: ModRelease[] = [];
    for (const release of data as GithubRelease[]) {
        const asset = release.assets?.find(a => a.name.includes("@") && isModArchive(a.name));
        if (!asset) continue;

        releases.push({
            id: release.id,
            name: release.name,
            publishedAt: release.published_at,
            downloadName: modArchiveName(asset.name),
            downloadUrl: asset.browser_download_url,
        });
    }

    releasesCache.set(githubUrl, releases);
    log("ModDiscovery", `${githubUrl} has ${releases.length} installable release(s) of ${data.length} on GitHub`);
    return releases;
}
