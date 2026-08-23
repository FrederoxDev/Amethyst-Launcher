import { create } from "zustand";
import { log } from "@renderer/scripts/LauncherLog";

export type NodeCallback<SubmitArgs> = (
    args: PopupUseArguments<SubmitArgs>
) => React.ReactNode | Promise<React.ReactNode>;
export type NodeOrCallback<SubmitArgs> = React.ReactNode | NodeCallback<SubmitArgs> | null;
export type PopupUseArguments<T> = { submit: (result: T) => void; state: PopupState };

export interface PopupEntry {
    /** Identity for React, and what removes this popup without disturbing the ones around it. */
    id: number;
    node: React.ReactNode;
    /**
     * Set the moment its close animation starts. The topmost popup owns the backdrop, so a
     * closing one has to give that up straight away or the layer below would sit unlit until
     * the animation finished.
     */
    closing: boolean;
}

export interface PopupState {
    /** Bottom to top: the last entry is the one the user is working in. */
    entries: PopupEntry[];
    push(entry: PopupEntry): void;
    remove(id: number): void;
    markClosing(id: number): void;
}

function isThenable(value: unknown): value is Promise<React.ReactNode> {
    return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export class NodeUtils {
    static async resolveNode<SubmitArgs>(
        nodeOrCallback: NodeOrCallback<SubmitArgs>,
        args: PopupUseArguments<SubmitArgs>
    ): Promise<React.ReactNode> {
        const node = typeof nodeOrCallback === "function" ? nodeOrCallback(args) : nodeOrCallback;
        return isThenable(node) ? await node : node;
    }
}

export class Popup {
    private static nextId = 1;

    /** Settles a popup that is cleared from underneath it, keyed by entry id. */
    private static abandoners = new Map<number, () => void>();

    private static state = create<PopupState>(set => ({
        entries: [],
        push: entry => set(state => ({ entries: [...state.entries, entry] })),
        remove: id => set(state => ({ entries: state.entries.filter(entry => entry.id !== id) })),
        markClosing: id =>
            set(state => ({
                entries: state.entries.map(entry => (entry.id === id ? { ...entry, closing: true } : entry)),
            })),
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
        return this.state.getState().entries.length > 0;
    }

    /**
     * Shows `node` and resolves with whatever it submits. Popups stack: asking while one is
     * already open layers the new one on top rather than queueing behind it, so a flow that
     * opens a popup from inside another - Settings opening Debug Info, a picker opening a
     * confirmation - works without dismissing what the user was already looking at.
     * Submitting removes that popup and uncovers the one beneath it.
     */
    static ask<T = void>(node: NodeOrCallback<T>): Promise<T> {
        const id = this.nextId++;

        return new Promise<T>((resolve, reject) => {
            let settled = false;

            const release = () => {
                settled = true;
                this.abandoners.delete(id);
                this.state.getState().remove(id);
            };

            const finish = (result: T) => {
                if (settled) return;
                release();
                resolve(result);
            };

            this.abandoners.set(id, () => {
                if (settled) return;
                release();
                log("Popup", "The popup was cleared without submitting; treating it as dismissed.");
                resolve(null as T);
            });

            const args: PopupUseArguments<T> = { submit: finish, state: this.state.getState() };
            NodeUtils.resolveNode(node, args)
                .then(resolved => {
                    // A popup that submitted while its node was still resolving must not appear.
                    if (settled) return;
                    this.state.getState().push({ id, node: resolved, closing: false });
                })
                .catch(e => {
                    if (settled) return;
                    release();
                    reject(e);
                });
        });
    }

    /** Drops the popup on top and settles its caller as dismissed. */
    static dismiss(): void {
        const { entries } = this.state.getState();
        const top = entries[entries.length - 1];
        if (top) this.abandoners.get(top.id)?.();
    }
}
