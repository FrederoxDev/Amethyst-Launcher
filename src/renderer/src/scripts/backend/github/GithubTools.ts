import { fetchWithTimeout } from "@renderer/scripts/Utility";
import { GithubRelease } from "./GithubRelease";

export class GithubTools {
    static async getLatestRelease(repo: string, timeout: number | null = null): Promise<GithubRelease> {
        const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;

        try {
            const response = timeout ? await fetchWithTimeout(apiUrl, {}) : await fetch(apiUrl);
            if (!response.ok) {
                throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            const release: GithubRelease = {
                tagName: data.tag_name,
                assets: data.assets.map((asset: any) => ({
                    name: asset.name,
                    downloadUrl: asset.browser_download_url
                }))
            };

            return release;
        } catch (error) {
            console.error("Error fetching latest release:", error);
            throw error;
        }
    }
}