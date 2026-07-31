import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { ForeignGameDataError } from "@renderer/scripts/platform/LauncherPlatform";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { adoptGameData } from "./AdoptGameData";

const path = window.require("path") as typeof import("path");

interface ResolvedMods {
    runtime: { id: string; path: string } | null;
    mods: { id: string; path: string }[];
}

function resolveMods(profile: Profile): ResolvedMods {
    const { allMods, modsPath } = {
        allMods: useAppStore.getState().allMods,
        modsPath: useAppStore.getState().platform.getPaths().modsPath,
    };

    const missing = profile.mods.filter(id => !allMods.some(mod => mod.ok && mod.id === id));
    if (missing.length > 0) {
        throw new Error(
            `This profile is missing ${missing.length} mod${missing.length > 1 ? "s" : ""}: `
            + `${missing.map(id => `'${id}'`).join(", ")}. Edit the profile to fix it.`
        );
    }

    const active = allMods.filter(mod => mod.ok && profile.mods.includes(mod.id));
    const runtimes = active.filter(mod => mod.config?.meta?.type === "runtime");

    if (isModded(profile)) {
        if (runtimes.length === 0) throw new Error("A modded profile needs a runtime mod.");
        if (runtimes.length > 1) {
            throw new Error(
                `A modded profile can only have one runtime mod. Found: ${runtimes.map(m => `'${m.id}'`).join(", ")}.`
            );
        }
    }

    const toEntry = (id: string) => ({ id, path: path.join(modsPath, id) });
    return {
        runtime: runtimes[0] ? toEntry(runtimes[0].id) : null,
        mods: active.map(mod => toEntry(mod.id)),
    };
}

async function resolveVersion(profile: Profile): Promise<InstalledVersion> {
    if (!profile.versionUuid) {
        throw new Error("This profile has no Minecraft version selected. Pick one in the profile editor.");
    }

    const { versions } = useAppStore.getState();
    let resolved: InstalledVersion | null = null;

    await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
        setStatus("other");
        setProgress(0);
        setMessage(`Checking ${profile.versionLabel || profile.versionUuid}...`);
        resolved = await versions.resolveOrInstall(profile.versionUuid);
    }, true);

    if (!resolved) throw new Error("Could not resolve this profile's Minecraft version.");

    const version = resolved as InstalledVersion;
    if (version.channel !== profile.channel) {
        throw new Error(
            `This profile is set to ${profile.channel} but "${version.label}" is a ${version.channel} build. `
            + `Pick a ${profile.channel} version, or create a ${version.channel} profile.`
        );
    }
    return version;
}

export async function launchProfile(profile: Profile): Promise<void> {
    if (!ProgressBar.canDoAction("launch")) return;

    const resolvedMods = resolveMods(profile);
    const version = await resolveVersion(profile);

    const store = useAppStore.getState();
    store.setLastLaunchedProfileUuid(profile.uuid);

    // Unowned data in the way is the user's call. Resolve it, then try once more.
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            await ProgressBar.useAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("launching");
                setProgress(0.5);
                setMessage(`Preparing ${version.label}...`);
                await store.platform.launch({ profile, version, ...resolvedMods }, setMessage);
            }, true);
            return;
        } catch (e) {
            if (attempt > 0 || !(e instanceof ForeignGameDataError)) throw e;
            await adoptGameData(e.channel);
        }
    }
}

export async function launchProfileByUuid(profileUuid: string): Promise<void> {
    const profile = useAppStore.getState().profiles.find(p => p.uuid === profileUuid);
    if (!profile) throw new Error(`No profile with UUID ${profileUuid}.`);
    await launchProfile(profile);
}
