import { create } from "zustand";
import { log } from "@renderer/scripts/LauncherLog";
import { SetStateAction, StateUtils } from "./StateUtils";

export type NodeCallback<SubmitArgs> = (args: PopupUseArguments<SubmitArgs>) => React.ReactNode | Promise<React.ReactNode>;
export type NodeOrCallback<SubmitArgs> = React.ReactNode | NodeCallback<SubmitArgs> | null;
export type PopupUseArguments<T> = { submit: (result: T) => void, state: PopupState };

interface PopupState {
    node: React.ReactNode | null;
    /** Changes whenever a different popup is shown, so its close animation starts fresh. */
    generation: number;
    setNode(node: SetStateAction<React.ReactNode | null>): void;
}

function isThenable(value: unknown): value is Promise<React.ReactNode> {
    return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export class NodeUtils {
    static async resolveNode<SubmitArgs>(nodeOrCallback: NodeOrCallback<SubmitArgs>, args: PopupUseArguments<SubmitArgs>): Promise<React.ReactNode> {
        const node = typeof nodeOrCallback === "function" ? nodeOrCallback(args) : nodeOrCallback;
        return isThenable(node) ? await node : node;
    }
}

export class Popup {
    private static busy = false;
    /** Settles the popup currently on screen if something clears it from underneath. */
    private static abandonActive: (() => void) | null = null;
    /** One popup at a time, in the order they were asked for. */
    private static queue: Promise<unknown> = Promise.resolve();

    private static state = create<PopupState>((set, get) => ({
        node: null,
        generation: 0,
        setNode: (node) => {
            const next = StateUtils.resolveSetStateAction(node, get().node);
            set((state) => ({ node: next, generation: state.generation + 1 }));
            if (next === null) Popup.abandonActive?.();
        }
    }));

    static useState(): PopupState;
    static useState<T>(selector: (state: PopupState) => T): T;
    static useState<T>(selector?: (state: PopupState) => T): T | PopupState {
        return selector ? this.state(selector) : this.state();
    }

    static getState() {
        return this.state.getState();
    }

    static isOpen() {
        return this.busy;
    }

    /**
     * Shows `node` and resolves with whatever it submits. Asking while another popup is
     * open queues behind it rather than failing, so callers never have to check first.
     */
    static ask<T = void>(node: NodeOrCallback<T>): Promise<T> {
        const run = this.queue.then(() => this.open<T>(node), () => this.open<T>(node));
        this.queue = run.catch(() => undefined);
        return run;
    }

    private static open<T>(node: NodeOrCallback<T>): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            let settled = false;
            const release = () => {
                this.busy = false;
                this.abandonActive = null;
            };
            const finish = (result: T) => {
                if (settled) return;
                settled = true;
                release();
                this.state.getState().setNode(null);
                resolve(result);
            };

            this.busy = true;
            this.abandonActive = () => {
                if (settled) return;
                settled = true;
                release();
                log("Popup", "The popup was cleared without submitting; treating it as dismissed.");
                resolve(null as T);
            };

            const args: PopupUseArguments<T> = { submit: finish, state: this.state.getState() };
            NodeUtils.resolveNode(node, args)
                .then(resolved => {
                    if (settled) return;
                    this.state.getState().setNode(resolved);
                })
                .catch(e => {
                    if (settled) return;
                    settled = true;
                    release();
                    this.state.getState().setNode(null);
                    reject(e);
                });
        });
    }

    /** Drops the popup on screen and settles its caller as dismissed. */
    static dismiss(): void {
        if (this.abandonActive) this.state.getState().setNode(null);
    }
}
