import { ActionType, AppStatusType, LauncherStatus } from "@renderer/contexts/AppState";

export const BLOCKED_ACTIONS: Record<AppStatusType, ActionType[]> = {
    idle: [],
    downloading: ["launch", "download", "extract", "decrypt"],
    extracting: ["launch", "download", "extract", "decrypt"],
    decrypting: ["launch", "download", "extract", "decrypt"],
    launching: ["launch", "download", "extract", "decrypt"],
};

export const DEFAULT_STATUS: LauncherStatus = {
    type: "idle",
    taskName: null,
    progress: null,
    errorMsg: null,
    showLoading: false,
    canCancel: false,
};