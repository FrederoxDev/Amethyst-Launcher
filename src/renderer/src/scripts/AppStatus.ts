export type AppStatusType =
    | "other"
    | "idle"
    | "downloading"
    | "extracting"
    | "decrypting"
    | "launching"
    | "importing"
    | "deleting";

export type ActionType = "launch" | "download" | "extract" | "decrypt";

export const BLOCKED_ACTIONS: Record<AppStatusType, ActionType[]> = {
    idle: [],
    downloading: ["launch", "download", "extract", "decrypt"],
    extracting: ["launch", "download", "extract", "decrypt"],
    decrypting: ["launch", "download", "extract", "decrypt"],
    launching: ["launch", "download", "extract", "decrypt"],
    importing: ["launch", "download", "extract", "decrypt"],
    deleting: ["launch", "download", "extract", "decrypt"],
    // A step the launcher has no better word for is still a step it is in the middle of, so it
    // blocks everything the named ones block. An empty list here is what let a second Play press
    // through while the first was still working out which version it needed.
    other: ["launch", "download", "extract", "decrypt"],
};
