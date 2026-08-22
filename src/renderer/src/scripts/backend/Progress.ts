export type DownloadProgress = (transferred: number, totalSize: number) => void;
export type ExtractProgress = (fileIndex: number, totalFiles: number, filename: string) => void;
