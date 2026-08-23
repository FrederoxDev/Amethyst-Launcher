import { describeError } from "@shared/diagnostics/Log";
import { useAppStore } from "@renderer/states/AppStore";
import { errnoCode } from "./Directories";
import { log } from "./LauncherLog";
import { PathUtils } from "./PathUtils";

const fs = window.require("fs") as typeof import("fs");

interface LockRecord {
    session: string;
    pid: number;
    since: string;
}

/** A lock whose owner is gone excludes nobody, so the pid is the whole point of the file. */
function processAlive(pid: number): boolean {
    if (!Number.isInteger(pid) || pid <= 0) return false;
    try {
        process.kill(pid, 0);
        return true;
    } catch (e) {
        return errnoCode(e) === "EPERM";
    }
}

/**
 * A cross-process advisory lock over a file path. The holder is a live process, not a run of
 * this module, so a launcher that crashed mid-install leaves a lock every later run can tell
 * is dead.
 */
export class FileLocker {
    public readonly LOCK_SESSION: string = crypto.randomUUID();

    private constructor() {
        log("FileLocker", `Session ${this.LOCK_SESSION} (pid ${process.pid}) owns the locks taken by this run`);
    }

    private static lockPathFor(filePath: string): string {
        return `${filePath}.lock`;
    }

    /** The live holder of `filePath`, or null when nothing holds it. */
    private holder(filePath: string): LockRecord | null {
        const lockFilePath = FileLocker.lockPathFor(filePath);
        if (!fs.existsSync(lockFilePath)) return null;

        let record: LockRecord;
        try {
            record = JSON.parse(fs.readFileSync(lockFilePath, "utf-8")) as LockRecord;
        } catch (e) {
            log(
                "FileLocker",
                `${lockFilePath} could not be read as a lock record, so it holds nothing: ${describeError(e)}`
            );
            return null;
        }

        if (typeof record?.session !== "string" || typeof record?.pid !== "number") {
            log("FileLocker", `${lockFilePath} is not a lock record (${JSON.stringify(record)}), so it holds nothing`);
            return null;
        }

        if (!processAlive(record.pid)) {
            log(
                "FileLocker",
                `${lockFilePath} was taken by session ${record.session} in pid ${record.pid}, which is no longer ` +
                    `running, so it counts as stale and may be cleared`
            );
            return null;
        }
        return record;
    }

    lockFile(filePath: string): void {
        PathUtils.ensureParentDirectory(filePath);
        const lockFilePath = FileLocker.lockPathFor(filePath);
        const record: LockRecord = { session: this.LOCK_SESSION, pid: process.pid, since: new Date().toISOString() };
        fs.writeFileSync(lockFilePath, JSON.stringify(record), "utf-8");
        log(
            "FileLocker",
            `Locked ${filePath} (wrote ${lockFilePath} for session ${this.LOCK_SESSION}, pid ${process.pid})`
        );
    }

    /** Releases a lock this run took. A lock another live process holds is left alone. */
    unlockFile(filePath: string): void {
        const lockFilePath = FileLocker.lockPathFor(filePath);
        const held = this.holder(filePath);
        if (held !== null && held.session !== this.LOCK_SESSION) {
            log(
                "FileLocker",
                `Not unlocking ${filePath}: ${lockFilePath} belongs to session ${held.session} in pid ${held.pid}`
            );
            return;
        }

        try {
            fs.rmSync(lockFilePath, { force: true });
        } catch (e) {
            log("FileLocker", `Could not remove ${lockFilePath}: ${describeError(e)}`);
            return;
        }
        log("FileLocker", `Unlocked ${filePath}`);
    }

    /** True while a running process holds the lock, whether or not that process is this one. */
    isLocked(filePath: string): boolean {
        return this.holder(filePath) !== null;
    }

    /** True only while this run holds the lock, which is what makes a refusal message accurate. */
    isLockedByThisRun(filePath: string): boolean {
        return this.holder(filePath)?.session === this.LOCK_SESSION;
    }

    static get(): FileLocker {
        return useAppStore.getState().fileLocker;
    }

    static create(): FileLocker {
        return new FileLocker();
    }
}
