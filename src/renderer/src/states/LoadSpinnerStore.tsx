import { create } from "zustand";
import { StateUtils } from "./StateUtils";

interface LoadSpinnerState {
    visible: boolean;
    text: string | null;
    setVisible(visible: boolean): void;
    setText(text: string | null): void;
}

type LoadSpinnerUseArguments = { setText: (text: string | null) => void, state: LoadSpinnerState };

export class LoadSpinner {
    private static state = create<LoadSpinnerState>((set) => ({
        visible: false,
        text: "",
        setVisible: (visible) => set((state) => ({
            visible: StateUtils.resolveSetStateAction(visible, state.visible)
        })),
        setText: (text) => set((state) => ({
            text: StateUtils.resolveSetStateAction(text, state.text)
        }))
    }));

    static useState(): LoadSpinnerState;
    static useState<T>(selector: (state: LoadSpinnerState) => T): T;
    static useState<T>(selector?: (state: LoadSpinnerState) => T): T | LoadSpinnerState {
        return selector ? this.state(selector) : this.state();
    }

    static getState() {
        return this.state.getState();
    }

    static async useAsync<T>(text: string | null, promise: (args: LoadSpinnerUseArguments) => Promise<T>): Promise<T> {
        return new Promise<T>(async (resolve) => {
            this.state.getState().setText(text);
            this.state.getState().setVisible(true);
            const result = await promise({
                setText: (text: string | null) => this.state.getState().setText(text),
                state: this.state.getState()
            });

            this.state.getState().setVisible(false);
            resolve(result);
        });
    }
}