import { useAppStore } from "@renderer/states/AppStore";

const MINECRAFT_EXECUTABLE = "Minecraft.Windows.exe";
const POLL_INTERVAL_MS = 3000;

let watcherInterval: ReturnType<typeof setInterval> | null = null;

export async function checkIfMinecraftIsRunning(): Promise<boolean> {
    const { platform, setMinecraftIsRunning } = useAppStore.getState();
    const info = await platform.isProcessRunning(MINECRAFT_EXECUTABLE);
    setMinecraftIsRunning(info !== null);
    return info !== null;
}

/**
 * Starts polling `isProcessRunning` every few seconds and updates
 * `minecraftIsRunning` in the AppStore accordingly.
 * Safe to call multiple times — only one watcher runs at a time.
 */
export function startMinecraftWatcher(): void {
    if (watcherInterval !== null) return;

    watcherInterval = setInterval(async () => {
        try {
            await checkIfMinecraftIsRunning();
        } catch {
            stopMinecraftWatcher();
        }
    }, POLL_INTERVAL_MS);
}

/**
 * Stops the watcher and resets the running state to `false`.
 */
export function stopMinecraftWatcher(): void {
    if (watcherInterval === null) return;
    clearInterval(watcherInterval);
    watcherInterval = null;
    useAppStore.getState().setMinecraftIsRunning(false);
}
