import { useAppStore } from "@renderer/states/AppStore";
import { PathUtils } from "./PathUtils";

const { v4: uuidv4 } = require("uuid") as typeof import("uuid");
const fs = window.require("fs") as typeof import("fs");

export class FileLocker {
    public readonly LOCK_SESSION: string = uuidv4();

    private constructor() {
        console.log("FileLocker instance created with session: ", this.LOCK_SESSION);
    }

    lockFile(filePath: string): void {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        fs.writeFileSync(lockFilePath, this.LOCK_SESSION, "utf-8");
    }

    unlockFile(filePath: string): void {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        if (fs.existsSync(lockFilePath)) {
            fs.rmSync(lockFilePath);
        }
    }

    isLocked(filePath: string): boolean {
        PathUtils.ValidatePath(filePath);
        const lockFilePath = `${filePath}.lock`;
        if (!fs.existsSync(lockFilePath)) {
            return false;
        }
        const lockSession = fs.readFileSync(lockFilePath, "utf-8");
        return lockSession === this.LOCK_SESSION;
    }

    static get(): FileLocker {
        return useAppStore.getState().fileLocker;
    }

    static create(): FileLocker {
        return new FileLocker();
    }
}