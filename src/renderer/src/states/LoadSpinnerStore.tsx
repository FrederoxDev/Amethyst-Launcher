import { create } from "zustand";
import { StateUtils } from "./StateUtils";

interface LoadSpinnerState {
    visible: boolean;
    text: string | null;
    setVisible(visible: boolean): void;
    setText(text: string | null): void;
}

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
}