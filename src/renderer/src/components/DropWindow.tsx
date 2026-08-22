import * as fs from "fs";
import { useEffect, useState } from "react";

import { useAppStore } from "@renderer/states/AppStore";

import { describeError } from "@shared/diagnostics/Log";
import { CopyRecursive } from "@renderer/scripts/Files";
import { ImportModArchive, isModArchive } from "@renderer/flows/ImportMod";
import { log } from "@renderer/scripts/LauncherLog";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

const path = window.require("path") as typeof import("path");
const { ipcRenderer } = window.require("electron") as typeof import("electron");

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

            if (!event.dataTransfer || !event.dataTransfer.types.includes("Files")) {
                log("DropWindow", `Ignoring a drop that carries no files (types: ${event.dataTransfer?.types ?? "none"})`);
                return;
            }

            // Reject drops while the launcher is busy with another operation
            // (onboarding, launch prep, version install/uninstall, profile delete).
            // Allowing a drop would race ProgressBar.runAsync and clobber state.
            if (ProgressBar.isBusy()) {
                log(
                    "DropWindow",
                    `Rejecting a drop of ${event.dataTransfer.files.length} item(s): the launcher is `
                    + `"${ProgressBar.getState().currentStatus}"`
                );
                setError("Wait for the current operation to finish before importing.");
                return;
            }

            type ElectronFile = File & { path: string };
            const items = event.dataTransfer.files as unknown as ElectronFile[];
            log("DropWindow", `Dropped ${items.length} item(s): ${Array.from(items).map(f => f.path).join(", ")}`);

            // Serialize folder imports so they queue cleanly through ProgressBar.
            // Archive imports go through Extractor (no ProgressBar contention) so they
            // can fire in parallel.
            (async () => {
                for (const file of items) {
                    const file_path: string = file.path;
                    try {
                        const st = fs.lstatSync(file_path);
                        if (st.isDirectory()) {
                            await ImportFolder(file_path);
                        } else if (st.isFile()) {
                            ImportArchive(file_path);
                        } else {
                            log("DropWindow", `Ignoring ${file_path}: it is neither a file nor a folder`);
                            setError(`${path.basename(file_path)} is not a file or folder.`);
                        }
                    } catch (e) {
                        log("DropWindow", `Could not read the dropped ${file_path}: ${describeError(e)}`);
                        setError((e as Error).message);
                    }
                }
            })();
        }

        // IMPORT ARCHIVE
        function ImportArchive(archive_path: string) {
            if (!isModArchive(archive_path)) {
                log("DropWindow", `Rejecting ${archive_path}: its extension is not .amethyst or .zip`);
                setError(`${path.basename(archive_path)} is not a mod file. Drop a .amethyst or .zip file.`);
                return;
            }

            ImportModArchive(archive_path).catch(error => {
                log("DropWindow", `Importing ${archive_path} failed: ${describeError(error)}`);
                setError((error as Error).message);
            });
        }

        function openFile(_event: unknown, file_path: string) {
            log("DropWindow", `Opening ${file_path} handed over by the operating system`);
            if (ProgressBar.isBusy()) {
                log(
                    "DropWindow",
                    `Rejecting ${file_path}: the launcher is "${ProgressBar.getState().currentStatus}"`
                );
                setError("Wait for the current operation to finish before importing.");
                return;
            }

            ImportArchive(file_path);
        }

        // IMPORT FOLDER
        async function ImportFolder(folder_path: string) {
            log("DropWindow", `Copying the folder ${folder_path} into ${paths.modsPath}`);
            try {
                await ProgressBar.runAsync(async (state) => {
                    state.setMessage(`Importing ${path.basename(folder_path)}...`);
                    await CopyRecursive(folder_path, paths.modsPath);
                }, true, FULL_PROGRESS_RESET_OPTIONS);
                log("DropWindow", `Copied ${folder_path} into ${paths.modsPath}`);
                refreshAllMods();
            } catch (error) {
                log("DropWindow", `Copying ${folder_path} into ${paths.modsPath} failed: ${describeError(error)}`);
                setError((error as Error).message);
            }
        }

        // EVENT LISTENERS
        window.addEventListener("dragover", dragOver);
        window.addEventListener("dragenter", dragStart);
        window.addEventListener("dragleave", dragEnd);
        window.addEventListener("drop", drop);
        ipcRenderer.on("AMETHYST_OPEN_FILE", openFile);

        return () => {
            window.removeEventListener("dragover", dragOver);
            window.removeEventListener("dragenter", dragStart);
            window.removeEventListener("dragleave", dragEnd);
            window.removeEventListener("drop", drop);
            ipcRenderer.off("AMETHYST_OPEN_FILE", openFile);
        };
    }, [setError, refreshAllMods, paths.modsPath]);

    return (
        <div
            className={`drop-window ${hovered ? "drop-window-visible" : "drop-window-hidden"}`}
        >
            <div className="drop-window-backdrop" />

            <h1 className="minecraft-seven drop-window-text">
                Drop mod file or folder to import
            </h1>
        </div>
    );
}
