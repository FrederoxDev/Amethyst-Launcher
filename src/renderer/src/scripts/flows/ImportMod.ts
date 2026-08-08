import { Extractor } from "@renderer/scripts/backend/Extractor";
import { useAppStore } from "@renderer/states/AppStore";

const path = window.require("path") as typeof import("path");

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
    const extracted_folder_path = path.join(paths.modsPath, modArchiveName(path.basename(archive_path)));

    let extracted = false;
    await Extractor.extractFile(archive_path, extracted_folder_path, [], undefined, success => {
        extracted = success;
    });

    if (!extracted) {
        throw new Error(`Failed to extract ${path.basename(archive_path)}`);
    }

    useAppStore.getState().refreshAllMods();
}
