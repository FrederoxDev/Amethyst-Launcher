import { describeError } from "@shared/diagnostics/Log";
import { Extractor } from "@renderer/scripts/backend/Extractor";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";

const path = window.require("path") as typeof import("path");
const fs = window.require("fs") as typeof import("fs");

export const MOD_ARCHIVE_EXTENSIONS = [".amethyst", ".zip"];

export function isModArchive(file_name: string): boolean {
    return MOD_ARCHIVE_EXTENSIONS.includes(path.extname(file_name).toLowerCase());
}

/** Install folder name for an archive, e.g. "Replay@0.0.1.amethyst" -> "Replay@0.0.1". */
export function modArchiveName(file_name: string): string {
    return path.parse(file_name).name;
}

/** Extension to save a download under, taken from the asset name or url. */
export function modArchiveExtension(file_name: string): string {
    return file_name.toLowerCase().endsWith(".amethyst") ? ".amethyst" : ".zip";
}

export async function ImportModArchive(archive_path: string): Promise<void> {
    const paths = useAppStore.getState().platform.getPaths();
    const archive_name = path.basename(archive_path);
    const extracted_folder_path = path.join(paths.modsPath, modArchiveName(archive_name));

    const replacingExisting = fs.existsSync(extracted_folder_path);
    log(
        "ImportMod",
        `Installing ${archive_path} into ${extracted_folder_path}, ` +
            `${replacingExisting ? "replacing the folder already there" : "as a new folder"}`
    );

    try {
        await Extractor.extractFile(archive_path, extracted_folder_path, []);
    } catch (error) {
        log("ImportMod", `Extracting ${archive_path} into ${extracted_folder_path} failed: ${describeError(error)}`);
        const reason = error instanceof Error ? error.message : String(error);

        if (replacingExisting) {
            // Someone else's files live here; a half-written folder is bad but deleting it is worse.
            log(
                "ImportMod",
                `Leaving ${extracted_folder_path} in place: it existed before this import, so it may now hold ` +
                    `a mix of the old and new mod`
            );
            throw new Error(
                `Could not install ${archive_name}: ${reason} ` +
                    `The existing files in "${extracted_folder_path}" may be a mix of old and new - reinstall the mod.`,
                { cause: error }
            );
        }

        // We created this folder, so a half-extracted one would show up as an installed mod. Drop it.
        log("ImportMod", `Deleting the half-extracted ${extracted_folder_path}, which this import created`);
        await fs.promises.rm(extracted_folder_path, { recursive: true, force: true }).catch(cleanupError => {
            log("ImportMod", `Could not remove ${extracted_folder_path}: ${describeError(cleanupError)}`);
        });
        throw new Error(`Could not install ${archive_name}: ${reason}`, { cause: error });
    }

    log("ImportMod", `Installed ${archive_name} into ${extracted_folder_path}`);
    useAppStore.getState().refreshAllMods();
}
