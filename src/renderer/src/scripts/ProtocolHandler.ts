import { launchProfileByUUID } from "@renderer/scripts/LaunchUtils";
import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";

const { ipcRenderer } = window.require("electron") as typeof import("electron");

export function initProtocolHandler(): void {
    ipcRenderer.on("AMETHYST_PROTOCOL_URL", async (_event: unknown, url: string) => {
        console.log(`[renderer] Protocol URL received: ${url}`);

        try {
            const parsed = new URL(url);
            // amethyst-launcher://launchprofile/<uuid>
            if (parsed.hostname === "launchprofile") {
                const profileUuid = parsed.pathname.replace(/^\//, "");
                if (profileUuid) {
                    await launchProfileByUUID(profileUuid);
                }
            }
        } catch (e) {
            console.error("[renderer] Failed to handle protocol URL:", e);
            useAppStore.getState().setError((e as Error).message);
            ProgressBar.reset();
        }
    });
}
