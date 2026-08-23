import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { launchErrorMessage, launchProfileByUuid } from "@renderer/flows/Launch";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

let registered = false;

/**
 * Must be reached before the first deep link can arrive, so it belongs to a module the app loads
 * on start rather than to a route the user may never open.
 */
export function registerProtocolLinks(): void {
    if (registered) return;
    registered = true;

    ipcRenderer.on("AMETHYST_PROTOCOL_URL", async (_event, url: string) => {
        await handleProtocolUrl(url);
    });
    log("Protocol", "Listening for amethyst-launcher:// links");
}

/**
 * A link the user clicked expecting a game, so a link this launcher cannot act on has to say so on
 * screen. Dropping it silently is indistinguishable from the launcher being broken.
 */
async function handleProtocolUrl(url: string): Promise<void> {
    log("Protocol", `Handling ${url}`);

    try {
        const parsed = new URL(url);
        // amethyst-launcher://launchprofile/<uuid>
        if (parsed.hostname !== "launchprofile") {
            log("Protocol", `Ignoring ${url}: "${parsed.hostname}" is not an action this launcher knows`);
            useAppStore.getState().setError(
                `That link asked the launcher to do something it does not know how to do ("${parsed.hostname}").`
                + "\n\nUpdate the launcher, or pick a profile here and press Play."
            );
            return;
        }

        const profileUuid = parsed.pathname.replace(/^\//, "");
        if (!profileUuid) {
            log("Protocol", `Ignoring ${url}: launchprofile carries no profile UUID after the slash`);
            useAppStore.getState().setError(
                "That link does not say which profile to start.\n\nPick a profile here and press Play."
            );
            return;
        }

        await launchProfileByUuid(profileUuid);
    } catch (e) {
        log("Protocol", `Handling ${url} failed: ${describeError(e)}`);
        useAppStore.getState().setError(launchErrorMessage(e));
        ProgressBar.reset();
    }
}

registerProtocolLinks();
