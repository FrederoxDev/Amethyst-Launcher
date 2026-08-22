import { describeError, userMessage } from "@shared/diagnostics/Log";
import { VersionChoice } from "@renderer/popups/VersionPickerPopup";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";

/**
 * Starts installing an imported .msixvc in the background. The profile referencing it
 * stays unlaunchable until this finishes, which surfaces on the next launch attempt.
 */
export function startPendingImport(choice: VersionChoice): void {
    if (!choice.pendingImport) {
        log(
            "VersionChoice",
            `Nothing to import for "${choice.label}" (${choice.versionUuid}): the pick was an installed or `
            + `catalog version, not a local .msixvc`
        );
        return;
    }

    log(
        "VersionChoice",
        `Starting the background import of "${choice.pendingImport.label}" from ${choice.pendingImport.file}`
    );

    const { versions, setError } = useAppStore.getState();
    versions.importMsixvc(choice.pendingImport)
        .then(installed => log("VersionChoice", `Background import of "${installed.label}" finished`))
        .catch(e => {
            log("VersionChoice", `Background import of "${choice.pendingImport!.label}" failed: ${describeError(e)}`);
            setError(`Could not import ${choice.pendingImport!.label}: ${userMessage(e)}`);
        });
}
