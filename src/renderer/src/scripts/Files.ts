import * as fs from "fs";

import { errnoCode } from "@renderer/scripts/Directories";

const path = window.require("path") as typeof import("path");

export async function CopyRecursive(source_path: string, target_path: string): Promise<void> {
    let st: import("fs").Stats;
    try {
        st = await fs.promises.lstat(source_path);
    } catch (e) {
        if (errnoCode(e) === "ENOENT") throw new Error(`start_path: '${source_path}' does not exist!`);
        throw e;
    }

    if (st.isDirectory()) {
        const copy_path: string = path.join(target_path, path.basename(source_path));
        await fs.promises.cp(source_path, copy_path, { recursive: true, errorOnExist: false });
    } else {
        await fs.promises.copyFile(source_path, target_path);
    }
}
