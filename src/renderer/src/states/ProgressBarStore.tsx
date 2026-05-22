import { ActionType, AppStatusType, BLOCKED_ACTIONS } from "@renderer/scripts/AppStatus";
import { SetStateAction, StateUtils } from "./StateUtils";
import { create } from "zustand";

interface ProgressBarState {
    busy: boolean;
    currentStatus: AppStatusType;
    message: string;
    progress: number;
    show: boolean;

    setStatus(status: AppStatusType): void;
    setMessage(message: SetStateAction<string>): void;
    setProgress(progress: SetStateAction<number>): void;
    setShow(show: SetStateAction<boolean>): void;
    /** Apply multiple field updates in a single zustand `set()` so subscribers see one consistent change. */
    update(partial: Partial<Pick<ProgressBarState, "busy" | "currentStatus" | "message" | "progress" | "show">>): void;
    reset(): void;
};

type ProgressResetOptions = {
    status: boolean;
    message: boolean;
    progress: boolean;
    show: boolean;
}

export const DEFAULT_PROGRESS_RESET_OPTIONS: ProgressResetOptions = {
    status: true,
    message: false,
    progress: false,
    show: false
}

export const FULL_PROGRESS_RESET_OPTIONS: ProgressResetOptions = {
    status: true,
    message: true,
    progress: true,
    show: true
}

export class ProgressBusyError extends Error {
    constructor() {
        super("Another launcher operation is already in progress. Wait for it to finish and try again.");
        this.name = "ProgressBusyError";
    }
}

export class ProgressBar {
    private static state = create<ProgressBarState>((set) => ({
        busy: false,
        currentStatus: "idle",
        message: "",
        progress: 0,
        show: false,

        setStatus(status) {
            set((state) => ({
                currentStatus: StateUtils.resolveSetStateAction(status, state.currentStatus)
            }));
        },
        setMessage(message) {
            set((state) => ({
                message: StateUtils.resolveSetStateAction(message, state.message)
            }));
        },
        setProgress(progress) {
            set((state) => ({
                progress: StateUtils.resolveSetStateAction(progress, state.progress)
            }));
        },
        setShow(show) {
            set((state) => ({
                show: StateUtils.resolveSetStateAction(show, state.show)
            }));
        },
        update(partial) {
            set(partial);
        },
        reset() {
            set({
                busy: false,
                currentStatus: "idle",
                message: "",
                progress: 0,
                show: false
            });
        }
    }));

    static getState(): ProgressBarState {
        return this.state.getState();
    };

    static useState(): ProgressBarState;
    static useState<T>(selector: (state: ProgressBarState) => T): T;
    static useState<T>(selector?: (state: ProgressBarState) => T): T | ProgressBarState {
        return selector ? this.state(selector) : this.state();
    }

    static use(callback: (state: ProgressBarState) => void, showProgressBar: boolean = true, resetOptions: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS): void {
        // Re-entrant: a nested use() (e.g. XVDTool.decryptFile called from extractVersionByPath)
        // inherits the outer call's lifecycle instead of throwing. The outer call owns
        // busy/show; the inner one just runs and any state it sets persists.
        if (this.getState().busy) {
            callback(this.getState());
            return;
        }

        const state = this.getState();
        state.update({ busy: true, show: showProgressBar, progress: 0, message: "" });

        try {
            callback(state);
        } finally {
            this.applyReset(resetOptions);
        }
    }

    static async useAsync(callback: (state: ProgressBarState) => Promise<void>, showProgressBar: boolean = true, resetOptions: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS): Promise<void> {
        // Re-entrant: see use() above.
        if (this.getState().busy) {
            await callback(this.getState());
            return;
        }

        const state = this.getState();
        state.update({ busy: true, show: showProgressBar, progress: 0, message: "" });

        try {
            await callback(state);
        } finally {
            this.applyReset(resetOptions);
        }
    }

    private static applyReset(resetOptions: ProgressResetOptions): void {
        const state = this.getState();
        const updates: Partial<Pick<ProgressBarState, "busy" | "currentStatus" | "message" | "progress" | "show">> = {
            busy: false,
        };
        if (resetOptions.status) updates.currentStatus = "idle";
        if (resetOptions.message) updates.message = "";
        if (resetOptions.progress) updates.progress = 0;
        if (resetOptions.show) updates.show = false;
        state.update(updates);
    }

    static reset(): void {
        this.getState().reset();
    }

    static isBusy(): boolean {
        return this.getState().busy;
    }

    /** React hook variant of {@link isBusy} — subscribes so callers re-render when busy flips. */
    static useIsBusy(): boolean {
        return this.useState(s => s.busy);
    }

    static canDoAction(actionType: ActionType): boolean {
        const state = this.getState();
        const blockedActions = BLOCKED_ACTIONS[state.currentStatus] || [];
        return !blockedActions.includes(actionType);
    }

    /**
     * React hook variant of {@link canDoAction} — subscribes to status changes
     * so the calling component re-renders when the answer flips.
     */
    static useCanDoAction(actionType: ActionType): boolean {
        const status = this.useState(s => s.currentStatus);
        const blockedActions = BLOCKED_ACTIONS[status] || [];
        return !blockedActions.includes(actionType);
    }
}
