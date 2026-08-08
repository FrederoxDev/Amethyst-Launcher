import { describeError } from "@shared/diagnostics/Log";
import { useAppStore } from "@renderer/states/AppStore";
import { log } from "./LauncherLog";
import { PathUtils } from "./PathUtils";

const { v4: uuidv4 } = require("uuid") as typeof import("uuid");
const fs = window.require("fs") as typeof import("fs");

export class FileLocker {
    public readonly LOCK_SESSION: string = uuidv4();

    private constructor() {
        log("FileLocker", `Session ${this.LOCK_SESSION} owns the locks taken by this run`);
    }

    lockFile(filePath: string): void {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        fs.writeFileSync(lockFilePath, this.LOCK_SESSION, "utf-8");
        log("FileLocker", `Locked ${filePath} (wrote ${lockFilePath} for session ${this.LOCK_SESSION})`);
    }

    unlockFile(filePath: string): void {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        if (!fs.existsSync(lockFilePath)) {
            log("FileLocker", `Unlock of ${filePath} did nothing: ${lockFilePath} was already gone`);
            return;
        }
        fs.rmSync(lockFilePath);
        log("FileLocker", `Unlocked ${filePath}`);
    }

    isLocked(filePath: string): boolean {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        if (!fs.existsSync(lockFilePath)) {
            return false;
        }

        let lockSession: string;
        try {
            lockSession = fs.readFileSync(lockFilePath, "utf-8");
        } catch (e) {
            // Treated as unlocked, which is what lets the caller clear it, so say so.
            log("FileLocker", `Treating ${filePath} as unlocked: could not read ${lockFilePath}: ${describeError(e)}`);
            return false;
        }

        if (lockSession !== this.LOCK_SESSION) {
            log(
                "FileLocker",
                `${lockFilePath} belongs to session ${lockSession || "(empty)"}, not this run's ${this.LOCK_SESSION}, `
                + `so it counts as stale and may be cleared`
            );
            return false;
        }
        return true;
    }

    static get(): FileLocker {
        return useAppStore.getState().fileLocker;
    }

    static create(): FileLocker {
        return new FileLocker();
    }
}
