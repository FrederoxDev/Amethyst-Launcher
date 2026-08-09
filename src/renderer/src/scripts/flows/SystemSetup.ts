import { describeError } from "@shared/diagnostics/Log";
import { SystemSetupRequiredError } from "@renderer/scripts/platform/LauncherPlatform";
import { log } from "@renderer/scripts/LauncherLog";
import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

/**
 * Explains what is about to be asked for, then applies the fix. Consent is taken outside
 * ProgressBar.useAsync because a popup raised from inside it fights the progress bar for
 * the same slot, which is why adoptGameData is sequenced the same way.
 */
export async function runSystemSetup(required: SystemSetupRequiredError): Promise<void> {
    const accepted = await confirmAction({
        title: required.title,
        message: required.explanation,
        confirmText: "Continue",
    });

    if (!accepted) {
        log("SystemSetup", `User declined: ${required.title}`);
        throw new Error(
            `Minecraft cannot start until this is done, so the launch was stopped.\n\n${required.explanation}`
        );
    }

    try {
        await ProgressBar.useAsync(async ({ setMessage }) => {
            setMessage("Waiting for permission...");
            await required.repair(setMessage);
        }, true, FULL_PROGRESS_RESET_OPTIONS);
    } catch (e) {
        log("SystemSetup", `"${required.title}" could not be applied: ${describeError(e)}`);
        throw e;
    }

    log("SystemSetup", `Applied: ${required.title}`);
}
