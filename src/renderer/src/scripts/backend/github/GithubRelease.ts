import { GithubAsset } from "./GithubAsset";

export type GithubRelease = {
    tagName: string;
    assets: GithubAsset[];
}