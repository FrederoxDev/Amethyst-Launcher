import { ActionType, AppStatusType, BLOCKED_ACTIONS } from "@renderer/scripts/AppStatus";
import { log } from "@renderer/scripts/LauncherLog";
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

export const FULL_PROGRESS_RESET_OPTIONS: ProgressResetOptions = {
    status: true,
    message: true,
    progress: true,
    show: true
}

export class ProgressBar {
    private static state = create<ProgressBarState>((set) => ({
        busy: false,
        currentStatus: "idle",
        message: "",
        progress: 0,
        show: false,

        // Status is the coarse state that gates launching, downloading and dropping files, so
        // each transition is recorded. Message and progress are not: they change per chunk.
        setStatus(status) {
            set((state) => {
                const next = StateUtils.resolveSetStateAction(status, state.currentStatus);
                if (next !== state.currentStatus) log("Progress", `Status: ${state.currentStatus} -> ${next}`);
                return { currentStatus: next };
            });
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
            set((state) => {
                if (partial.currentStatus !== undefined && partial.currentStatus !== state.currentStatus) {
                    log("Progress", `Status: ${state.currentStatus} -> ${partial.currentStatus}`);
                }
                return partial;
            });
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

    /**
     * The first caller in owns the bar; anyone who joins while it is busy (a nested
     * decrypt, or an unrelated download) shares that lifecycle. The bar is released
     * once the owner *and* every joiner has finished, on the owner's reset terms.
     */
    private static owner: symbol | null = null;
    private static ownerReset: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS;
    private static participants = 0;

    private static enter(showProgressBar: boolean, resetOptions: ProgressResetOptions): void {
        if (this.owner === null) {
            this.owner = Symbol("progress-owner");
            this.ownerReset = resetOptions;
            this.getState().update({ busy: true, show: showProgressBar, progress: 0, message: "" });
        }
        this.participants++;
    }

    private static leave(): void {
        this.participants = Math.max(0, this.participants - 1);
        if (this.participants > 0) return;

        const resetOptions = this.ownerReset;
        this.owner = null;
        this.ownerReset = FULL_PROGRESS_RESET_OPTIONS;
        this.applyReset(resetOptions);
    }

    static run(callback: (state: ProgressBarState) => void, showProgressBar: boolean = true, resetOptions: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS): void {
        this.enter(showProgressBar, resetOptions);
        try {
            callback(this.getState());
        } finally {
            this.leave();
        }
    }

    static async runAsync(callback: (state: ProgressBarState) => Promise<void>, showProgressBar: boolean = true, resetOptions: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS): Promise<void> {
        this.enter(showProgressBar, resetOptions);
        try {
            await callback(this.getState());
        } finally {
            this.leave();
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
        this.owner = null;
        this.ownerReset = FULL_PROGRESS_RESET_OPTIONS;
        this.participants = 0;
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
