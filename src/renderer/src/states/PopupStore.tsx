import { create } from "zustand";

export type NodeCallback<SubmitArgs> = (args: PopupUseArguments<SubmitArgs>) => React.ReactNode;
export type NodeOrCallback<SubmitArgs> = React.ReactNode | NodeCallback<SubmitArgs> | null;
export type PopupUseArguments<T> = { submit: (result: T) => void, state: PopupState };

interface PopupState {
    nodes: React.ReactNode[];
    pushNode(node: React.ReactNode): void;
    popNode(): void;
}

export class NodeUtils {
    static resolveNode<SubmitArgs>(nodeOrCallback: NodeOrCallback<SubmitArgs>, args: PopupUseArguments<SubmitArgs>): React.ReactNode {
        return typeof nodeOrCallback === "function" ? nodeOrCallback(args) : nodeOrCallback;
    }
}

export class Popup {
    private static state = create<PopupState>((set) => ({
        nodes: [],
        pushNode: (node) => set(state => ({ nodes: [...state.nodes, node] })),
        popNode: () => set(state => ({ nodes: state.nodes.slice(0, -1) })),
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
        return this.state.getState().nodes.length > 0;
    }

    static async useAsync<T = void>(node: NodeOrCallback<T>): Promise<T> {
        return new Promise<T>((resolve) => {
            const nodeArgs: PopupUseArguments<T> = {
                submit: (result: T) => {
                    this.state.getState().popNode();
                    resolve(result);
                },
                state: this.state.getState()
            };

            this.state.getState().pushNode(NodeUtils.resolveNode(node, nodeArgs));
        });
    }
}
