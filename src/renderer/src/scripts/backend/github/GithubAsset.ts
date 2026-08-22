export type GithubAsset = {
    name: string;
    downloadUrl: string;
    /** Size GitHub records for the asset, which is the only truncation check a chunked download has. */
    size: number;
}
