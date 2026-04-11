import * as fs from "fs";
import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/states/AppStore";

import { Extractor } from "@renderer/scripts/backend/Extractor";
import { CopyRecursive } from "@renderer/scripts/Files";

const path = window.require("path");

export function DropWindow() {
    const [hovered, setHovered] = useState(false);

    const setError = useAppStore(state => state.setError);
    const refreshAllMods = useAppStore(state => state.refreshAllMods);
    const platform = useAppStore(state => state.platform);
    const paths = platform.getPaths();

    useEffect(() => {
        let dragCount = 0;

        // DRAG EVENTS
        function dragOver(event: DragEvent) {
            event.preventDefault();
        }

        function dragStart(event: DragEvent) {
            event.preventDefault();

            // Ignore internal drags (e.g. profile card reordering) — only show overlay for file drops
            if (!event.dataTransfer?.types.includes("Files")) return;

            if (dragCount === 0) setHovered(true);

            dragCount++;
        }

        function dragEnd(event: DragEvent) {
            event.preventDefault();

            if (!event.dataTransfer?.types.includes("Files")) return;

            dragCount--;

            if (dragCount === 0) setHovered(false);
        }

        function drop(event: DragEvent) {
            event.preventDefault();

            setHovered(false);

            dragCount = 0;

            if (!event.dataTransfer || !event.dataTransfer.types.includes("Files")) return;

            type ElectronFile = File & { path: string };
            const items = event.dataTransfer.files as unknown as ElectronFile[];

            for (const file of items) {
                const file_path: string = file.path;

                if (fs.lstatSync(file_path).isDirectory()) {
                    ImportFolder(file_path);
                } else if (fs.lstatSync(file_path).isFile()) {
                    ImportZIP(file_path);
                } else {
                    console.error("File path does not point to a file or directory!");
                }
            }
        }

        // IMPORT ZIP
        function ImportZIP(zip_path: string) {
            try {
                const zip_name = path.basename(zip_path);
                const extracted_folder_path = path.join(paths.modsPath, zip_name.slice(0, -".zip".length));
                console.log(extracted_folder_path);
                Extractor.extractFile(zip_path, extracted_folder_path, [], undefined, success => {
                    if (!success) {
                        throw new Error("There was an error while extracting Mod ZIP!");
                    }

                    console.log("Successfully extracted Mod ZIP!");
                    refreshAllMods();
                }).then();
            } catch (error) {
                setError((error as Error).message);
            }
        }

        // IMPORT FOLDER
        function ImportFolder(folder_path: string) {
            try {
                CopyRecursive(folder_path, paths.modsPath);
                refreshAllMods();
            } catch (error) {
                setError((error as Error).message);
            }
        }

        // EVENT LISTENERS
        window.addEventListener("dragover", dragOver);
        window.addEventListener("dragenter", dragStart);
        window.addEventListener("dragleave", dragEnd);
        window.addEventListener("drop", drop);

        return () => {
            window.removeEventListener("dragover", dragOver);
            window.removeEventListener("dragenter", dragStart);
            window.removeEventListener("dragleave", dragEnd);
            window.removeEventListener("drop", drop);
        };
    }, [setError, refreshAllMods]);

    return (
        <div
            className={`drop-window ${hovered ? "drop-window-visible" : "drop-window-hidden"}`}
        >
            <div className="drop-window-backdrop" />

            <h1 className="minecraft-seven drop-window-text">
                Drop mod .zip or folder to import
            </h1>
        </div>
    );
}
