import { ActionType, AppStatusType, BLOCKED_ACTIONS } from "@renderer/scripts/AppStatus";
import { SetStateAction, StateUtils } from "./StateUtils";
import { create } from "zustand";

interface ProgressBarState {
    currentStatus: AppStatusType;
    message: string;
    progress: number;
    show: boolean;

    setStatus(status: AppStatusType): void;
    setMessage(message: SetStateAction<string>): void;
    setProgress(progress: SetStateAction<number>): void;
    setShow(show: SetStateAction<boolean>): void;
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

export class ProgressBar {
    private static state = create<ProgressBarState>((set) => ({
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
        reset() {
            set({
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
        const state = this.getState();
        state.setShow(showProgressBar);
        state.setProgress(0);
        state.setMessage("");

        try {
            callback(state);
        } finally {
            if (resetOptions) {
                if (resetOptions.status) state.setStatus("idle");
                if (resetOptions.message) state.setMessage("");
                if (resetOptions.progress) state.setProgress(0);
                if (resetOptions.show) state.setShow(false);
            }
        }
    }

    static async useAsync(callback: (state: ProgressBarState) => Promise<void>, showProgressBar: boolean = true, resetOptions: ProgressResetOptions = FULL_PROGRESS_RESET_OPTIONS): Promise<void> {
        const state = this.getState();
        state.setShow(showProgressBar);
        state.setProgress(0);
        state.setMessage("");
    
        try {
            await callback(state);
        } finally {
            if (resetOptions) {
                if (resetOptions.status) state.setStatus("idle");
                if (resetOptions.message) state.setMessage("");
                if (resetOptions.progress) state.setProgress(0);
                if (resetOptions.show) state.setShow(false);
            }
        }
    }

    static reset(): void {
        this.getState().reset();
    }

    static isBusy(): boolean {
        const state = this.getState();
        return state.currentStatus !== "idle";
    }

    static canDoAction(actionType: ActionType): boolean {
        const state = this.getState();
        const blockedActions = BLOCKED_ACTIONS[state.currentStatus] || [];
        return !blockedActions.includes(actionType);
    }
}