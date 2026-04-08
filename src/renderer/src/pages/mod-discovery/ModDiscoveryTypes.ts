export interface ModDiscoveryData {
    id: string;
    iconUrl: string;
    bannerUrl?: string;
    name: string;
    description: string;
    authors: string[];
    downloads: number;
    githubUrl: string;
    createdAt?: number;

    // Used to hide mods from the discovery page without deleting them
    hidden?: boolean;

    // Used exclusively for Amethyst org mods, no exceptions will be made to this
    isAmethystOrgMod?: boolean;
}

export interface GithubRelease {
    id: number;
    name: string;
    tag_name: string;
    html_url: string;
    published_at: string;
    prerelease: boolean;
    target_commitish: string;
    assets: {
        id: number;
        name: string;
        size: number;
        browser_download_url: string;
    }[];
}

export interface ParsedGithubRelease {
    name: string;
    id: number;
    published_at: string;
    prerelease: boolean;
    size: number;
    target_commitish: string;
    download_name: string;
    download_url: string;
}

export type SortMode = "downloads" | "date";
