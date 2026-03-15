import { create } from "zustand";
import { SetStateAction, StateUtils } from "./StateUtils";

export type NodeCallback<SubmitArgs> = (args: PopupUseArguments<SubmitArgs>) => React.ReactNode;
export type NodeOrCallback<SubmitArgs> = React.ReactNode | NodeCallback<SubmitArgs> | null;
export type PopupUseArguments<T> = { submit: (result: T) => void, state: PopupState };

interface PopupState {
    node: React.ReactNode | null;
    setNode(node: SetStateAction<React.ReactNode | null>): void;
}


export class NodeUtils {
    static resolveNode<SubmitArgs>(nodeOrCallback: NodeOrCallback<SubmitArgs>, args: PopupUseArguments<SubmitArgs>): React.ReactNode {
        return typeof nodeOrCallback === "function" ? nodeOrCallback(args) : nodeOrCallback;
    }
}

export class Popup {
    private static nodeFactory: (() => React.ReactNode) | null = null;
    private static busy = false;
    private static state = create<PopupState>((set) => ({
        node: null,
        setNode: (node) => set((state) => ({
            node: StateUtils.resolveSetStateAction(node, state.node)
        }))
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

    static async useAsync<T = void>(node: NodeOrCallback<T>): Promise<T> {
        if (this.busy) return new Promise<T>(() => {});
        this.busy = true;

        return new Promise<T>((resolve) => {
            const nodeArgs: PopupUseArguments<T> = {
                submit: (result: T) => {
                    this.busy = false;
                    this.state.getState().setNode(null);
                    resolve(result);
                },
                state: this.state.getState()
            };

            this.nodeFactory = () => NodeUtils.resolveNode(node, nodeArgs);
            this.state.getState().setNode(this.nodeFactory());
        });
    }
}