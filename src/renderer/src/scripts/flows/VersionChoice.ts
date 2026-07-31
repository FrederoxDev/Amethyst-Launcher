import { VersionChoice } from "@renderer/popups/VersionPickerPopup";
import { useAppStore } from "@renderer/states/AppStore";

/**
 * Starts installing an imported .msixvc in the background. The profile referencing it
 * stays unlaunchable until this finishes, which surfaces on the next launch attempt.
 */
export function startPendingImport(choice: VersionChoice): void {
    if (!choice.pendingImport) return;

    const { versions, setError } = useAppStore.getState();
    versions.importMsixvc(choice.pendingImport).catch(e => {
        console.error("[VersionChoice] Import failed:", e);
        setError(`Could not import ${choice.pendingImport!.label}: ${(e as Error).message ?? e}`);
    });
}
