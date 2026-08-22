import { describeError } from "@shared/diagnostics/Log";
import { AppStatusType } from "@renderer/scripts/AppStatus";
import { Profile, isModded } from "@renderer/scripts/domain/Profile";
import { describeProblem, diagnoseProfile, launchBlocker } from "@renderer/scripts/domain/ProfileDiagnosis";
import { toModStatus } from "@renderer/scripts/Mods";
import { log } from "@renderer/scripts/LauncherLog";
import { ForeignGameDataError, LaunchOutcome, SystemSetupRequiredError } from "@renderer/scripts/platform/LauncherPlatform";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { useAppStore } from "@renderer/states/AppStore";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { adoptGameData } from "./AdoptGameData";
import { runSystemSetup } from "./SystemSetup";

const path = window.require("path") as typeof import("path");

/** What the launcher is doing, said the way a user would say it. */
const BUSY_WORDING: Partial<Record<AppStatusType, string>> = {
    downloading: "downloading a Minecraft version",
    extracting: "unpacking a Minecraft version",
    decrypting: "unpacking a Minecraft version",
    launching: "starting Minecraft",
    importing: "importing files",
    deleting: "deleting files",
    other: "getting a Minecraft version ready",
};

/**
 * Claimed before the first `await`, because the status the progress bar carries is not set until
 * one has already been passed. Two Play presses in that gap both got through, and the two
 * reconcile runs behind them raced over the same channel's junction and package registration -
 * so one profile's game started on another profile's worlds.
 */
let launchInFlight = false;

interface ResolvedMods {
    runtime: { id: string; path: string } | null;
    mods: { id: string; path: string }[];
}

function resolveMods(profile: Profile): ResolvedMods {
    const { allMods, modsPath } = {
        allMods: useAppStore.getState().allMods,
        modsPath: useAppStore.getState().platform.getPaths().modsPath,
    };

    // The same diagnosis the profile editor and the launcher grid show, so the reason a launch
    // refuses is word for word the reason the user was already looking at.
    const problems = diagnoseProfile({
        modded: isModded(profile),
        modIds: profile.mods,
        mods: toModStatus(allMods),
        downloading: useAppStore.getState().downloadingMods,
    });

    const blocker = launchBlocker(problems);
    if (blocker) {
        log(
            "Launch",
            `"${profile.name}" cannot start (${blocker.kind}${blocker.modId ? `, ${blocker.modId}` : ""}): `
            + `${describeProblem(blocker).replace(/\n+/g, " ")}`
        );
        throw new Error(`${describeProblem(blocker)}\n\nOpen the profile to fix it.`);
    }

    const active = allMods.filter(mod => mod.ok && profile.mods.includes(mod.id));
    const runtimes = active.filter(mod => mod.config?.meta?.type === "runtime");

    const toEntry = (id: string): { id: string; path: string } => ({ id, path: path.join(modsPath, id) });
    const resolved = {
        runtime: runtimes[0] ? toEntry(runtimes[0].id) : null,
        mods: active.map(mod => toEntry(mod.id)),
    };
    log(
        "Launch",
        `Resolved mods for "${profile.name}": runtime ${resolved.runtime?.id ?? "none (vanilla)"}, `
        + `mods [${resolved.mods.map(m => m.id).join(", ") || "none"}] from ${modsPath}`
    );
    return resolved;
}

async function resolveVersion(profile: Profile): Promise<InstalledVersion> {
    if (!profile.versionUuid) {
        log("Launch", `"${profile.name}" (${profile.uuid}) carries no versionUuid`);
        throw new Error(
            "This profile has no Minecraft version selected.\n\nOpen the profile and pick one, then press Play."
        );
    }

    const { versions } = useAppStore.getState();
    let resolved: InstalledVersion | null = null;

    await ProgressBar.runAsync(async ({ setStatus, setMessage, setProgress }) => {
        setStatus("other");
        setProgress(0);
        setMessage(`Checking ${profile.versionLabel || profile.versionUuid}...`);
        resolved = await versions.resolveOrInstall(profile.versionUuid);
    }, true);

    if (!resolved) {
        log("Launch", `resolveOrInstall(${profile.versionUuid}) returned nothing for "${profile.name}"`);
        throw new Error(
            `${profile.versionLabel || "This profile's Minecraft version"} could not be prepared.\n\n`
            + "Open Versions, download it again, then press Play."
        );
    }

    const version = resolved as InstalledVersion;
    if (version.channel !== profile.channel) {
        log(
            "Launch",
            `Channel mismatch: profile "${profile.name}" is ${profile.channel} but its version `
            + `"${version.label}" (${version.uuid}) is ${version.channel}`
        );
        throw new Error(
            `This profile is set to ${profile.channel} but "${version.label}" is a ${version.channel} build. `
            + `Pick a ${profile.channel} version, or create a ${version.channel} profile.`
        );
    }
    log("Launch", `Version resolved to "${version.label}" (${version.uuid}) at ${version.path}`);
    return version;
}

export async function launchProfile(profile: Profile): Promise<LaunchOutcome> {
    log(
        "Launch",
        `Launch requested for "${profile.name}" (${profile.uuid}): ${profile.channel}, `
        + `version ${profile.versionLabel || "unset"} (${profile.versionUuid || "unset"}), `
        + `${isModded(profile) ? "modded" : "vanilla"}, mods [${profile.mods.join(", ") || "none"}]`
    );

    // Silently doing nothing here reads as a dead Play button, so say what is holding it, and
    // say it to the user too: the button is only greyed out on the page that owns it, and a
    // launch asked for from a link or another page arrives here with nothing shown at all.
    if (launchInFlight) {
        log("Launch", `Launch of "${profile.name}" refused: another launch is already running`);
        throw new Error(
            `The launcher is already starting Minecraft, so "${profile.name}" was not started.\n\n`
            + "Wait for that to finish, then press Play again."
        );
    }

    if (!ProgressBar.canDoAction("launch")) {
        const { currentStatus, message } = ProgressBar.getState();
        log(
            "Launch",
            `Launch of "${profile.name}" refused: the launcher is "${currentStatus}" `
            + `(${message || "no message"}), which blocks the launch action`
        );
        throw new Error(
            `The launcher is busy ${BUSY_WORDING[currentStatus] ?? "with something else"}, so "${profile.name}" `
            + "was not started.\n\nWait for that to finish, then press Play again."
        );
    }

    launchInFlight = true;
    try {
        return await runLaunch(profile);
    } finally {
        launchInFlight = false;
    }
}

async function runLaunch(profile: Profile): Promise<LaunchOutcome> {
    // Once before the version, so a profile that cannot start says so instead of downloading
    // several gigabytes first, and once after it, because a download runs for minutes and the
    // mods the first pass named may have been uninstalled or replaced in the meantime.
    resolveMods(profile);
    const version = await resolveVersion(profile);
    const resolvedMods = resolveMods(profile);

    const store = useAppStore.getState();
    store.setLastLaunchedProfileUuid(profile.uuid);

    // Two recoverable blockers, each fixable once: unowned data in the way, which is the
    // user's call, and a missing Windows setting, which the launcher fixes itself. Each
    // recovery re-runs the whole launch so it continues without another press of Launch.
    let adopted = false;
    let systemSetupDone = false;

    for (;;) {
        try {
            const outcome: LaunchOutcome = { confirmed: true, unconfirmedMessage: "" };
            await ProgressBar.runAsync(async ({ setStatus, setMessage, setProgress }) => {
                setStatus("launching");
                setProgress(0.5);
                setMessage(`Preparing ${version.label}...`);
                Object.assign(outcome, await store.platform.launch(
                    { profile, version, developerMode: store.developerMode, ...resolvedMods },
                    setMessage
                ));
            }, true);
            log("Launch", `"${profile.name}" started on "${version.label}"`);

            // A launch nobody could confirm is not a success to be reported as one. Said after
            // the progress bar has let go, so the banner is not cleared out from under it.
            if (!outcome.confirmed) {
                log("Launch", `"${profile.name}" could not be confirmed as running: ${outcome.unconfirmedMessage}`);
                useAppStore.getState().setError(outcome.unconfirmedMessage);
            }
            return outcome;
        } catch (e) {
            if (e instanceof ForeignGameDataError) {
                if (adopted) {
                    log("Launch", `Unowned ${e.channel} game data is still in the way after one adoption pass; giving up`);
                    throw e;
                }
                adopted = true;
                log("Launch", `Unowned ${e.channel} game data blocks the launch; asking the user what to do with it`);
                await adoptGameData(e.channel);
                log("Launch", `Retrying the launch of "${profile.name}" after resolving the ${e.channel} game data`);
                continue;
            }
            if (e instanceof SystemSetupRequiredError) {
                if (systemSetupDone) {
                    log("Launch", `"${e.title}" is still unsatisfied after one repair attempt; giving up`);
                    throw new Error(
                        "The launcher could not finish setting Windows up, so Minecraft was not started.\n\n"
                        + e.manualStep
                    );
                }
                systemSetupDone = true;
                log("Launch", `Launch blocked by "${e.title}"; running the repair`);
                await runSystemSetup(e);
                log("Launch", `Retrying the launch of "${profile.name}" after "${e.title}"`);
                continue;
            }
            log("Launch", `Launch of "${profile.name}" failed: ${describeError(e)}`);
            throw e;
        }
    }
}

export async function launchProfileByUuid(profileUuid: string): Promise<LaunchOutcome> {
    const profile = useAppStore.getState().profiles.find(p => p.uuid === profileUuid);
    if (!profile) {
        const known = useAppStore.getState().profiles.map(p => p.uuid).join(", ") || "none";
        log("Launch", `No profile with UUID ${profileUuid}; known profiles: ${known}`);
        throw new Error(
            "That profile no longer exists, so it could not be started.\n\n"
            + "Pick a profile in the launcher and press Play."
        );
    }
    return await launchProfile(profile);
}

/**
 * What the banner shows. Anything thrown on the launch path is meant to carry its own words, so
 * this only has to make sure that something reaches the user when one of them does not, because
 * a banner with nothing in it is the dead end this whole path exists to avoid.
 */
export function launchErrorMessage(e: unknown): string {
    const message = e instanceof Error ? e.message.trim() : typeof e === "string" ? e.trim() : "";
    if (message !== "") return message;

    return (
        "Minecraft could not be started, and the reason did not come back in a form that can be shown here.\n\n"
        + "Open Logs and send the newest launcher log."
    );
}
