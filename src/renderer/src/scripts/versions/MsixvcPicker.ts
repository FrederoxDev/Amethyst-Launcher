const { ipcRenderer } = window.require("electron") as typeof import("electron");
const fs = window.require("fs") as typeof import("fs");

import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";

/** Opens the file dialog and returns a readable `.msixvc`, or null if there is nothing to import. */
export async function pickMsixvcFile(where: string): Promise<string | null> {
    const picked = await ipcRenderer.invoke("dialog:openFile", [
        { name: "MSIXVC Files", extensions: ["msixvc"] },
    ]) as string | null;

    if (!picked) {
        log(where, "File picker closed without a .msixvc");
        return null;
    }
    try {
        if (!fs.statSync(picked).isFile()) {
            log(where, `Ignoring ${picked}: it is not a file`);
            return null;
        }
    } catch (e) {
        log(where, `Ignoring ${picked}: it could not be read: ${describeError(e)}`);
        return null;
    }
    log(where, `Selected ${picked}`);
    return picked;
}
