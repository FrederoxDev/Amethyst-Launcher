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
    assets: {
        id: number;
        name: string;
        browser_download_url: string;
    }[];
}

export interface ParsedGithubRelease {
    name: string;
    id: number;
    published_at: string;
    download_name: string;
    download_url: string;
}

export type SortMode = "downloads" | "date";
