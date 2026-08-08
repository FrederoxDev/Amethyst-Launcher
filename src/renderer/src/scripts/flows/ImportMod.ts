import { Extractor } from "@renderer/scripts/backend/Extractor";
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

    try {
        await Extractor.extractFile(archive_path, extracted_folder_path, []);
    } catch (error) {
        console.error(`[ImportMod] Failed to install "${archive_path}" into "${extracted_folder_path}".`, error);
        const reason = error instanceof Error ? error.message : String(error);

        if (replacingExisting) {
            // Someone else's files live here; a half-written folder is bad but deleting it is worse.
            throw new Error(
                `Could not install ${archive_name}: ${reason} ` +
                `The existing files in "${extracted_folder_path}" may be a mix of old and new - reinstall the mod.`,
                { cause: error }
            );
        }

        // We created this folder, so a half-extracted one would show up as an installed mod. Drop it.
        await fs.promises.rm(extracted_folder_path, { recursive: true, force: true }).catch(cleanupError => {
            console.error(`[ImportMod] Could not remove "${extracted_folder_path}".`, cleanupError);
        });
        throw new Error(`Could not install ${archive_name}: ${reason}`, { cause: error });
    }

    useAppStore.getState().refreshAllMods();
}
