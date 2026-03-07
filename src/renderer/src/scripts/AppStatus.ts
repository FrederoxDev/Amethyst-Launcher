export type AppStatusType = 
    | "other"
    | "idle"
    | "downloading"
    | "extracting"
    | "decrypting"
    | "launching";

export type ActionType = "launch" | "download" | "extract" | "decrypt";

export const BLOCKED_ACTIONS: Record<AppStatusType, ActionType[]> = {
    idle: [],
    downloading: ["launch", "download", "extract", "decrypt"],
    extracting: ["launch", "download", "extract", "decrypt"],
    decrypting: ["launch", "download", "extract", "decrypt"],
    launching: ["launch", "download", "extract", "decrypt"],
    other: [],
};