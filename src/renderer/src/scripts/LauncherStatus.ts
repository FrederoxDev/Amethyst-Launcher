import { ActionType, AppStatusType } from "@renderer/contexts/AppState";

export const BLOCKED_ACTIONS: Record<AppStatusType, ActionType[]> = {
    idle: [],
    downloading: ["launch", "download", "extract", "decrypt"],
    extracting: ["launch", "download", "extract", "decrypt"],
    decrypting: ["launch", "download", "extract", "decrypt"],
    launching: ["launch", "download", "extract", "decrypt"],
    other: [],
};