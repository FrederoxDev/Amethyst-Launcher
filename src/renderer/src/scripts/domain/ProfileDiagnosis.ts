/**
 * Says what is wrong with a profile, once, in words a user can act on.
 *
 * Pure on purpose, like LaunchDiagnostics: every input is a fact somebody else already read off
 * disk, so the decision table can be exercised without a mods folder behind it.
 *
 * This exists because the same question was being answered in four places - the profile editor,
 * the launcher grid, the mod row, and the launch itself - each with its own guess and none of
 * them carrying the validator's own reason. A profile whose runtime mod failed validation was
 * told "Modded Profiles must have a Runtime Mod", which is not what happened and not a thing the
 * user can fix. The reason existed the whole time and was thrown away at every step.
 */

export type ProfileProblemKind =
    /** Listed by the profile, but the mods folder holds no such mod. */
    | "mod-absent"
    /** Present, but its mod.json was rejected. `reasons` carries what the validator said. */
    | "mod-invalid"
    /** Modded, and nothing it lists declares itself a runtime. */
    | "runtime-absent"
    /** Modded, and more than one of its mods declares itself a runtime. */
    | "runtime-multiple";

export interface ProfileProblem {
    kind: ProfileProblemKind;
    /** The mod this is about, or null when it is about the profile as a whole. */
    modId: string | null;
    /** One line, short enough for a tooltip or a mod row. */
    headline: string;
    /** The validator's own words. Empty when the problem is not about one mod's contents. */
    reasons: string[];
    blocksLaunch: boolean;
}

/** What the mods folder scan already knows, narrowed to what a diagnosis needs. */
export interface ModStatus {
    id: string;
    ok: boolean;
    isRuntime: boolean;
    errors: readonly string[];
}

export interface ProfileDiagnosisInput {
    modded: boolean;
    modIds: readonly string[];
    mods: readonly ModStatus[];
    /** Still arriving, so its absence is not yet a fault. */
    downloading: readonly string[];
}

export function diagnoseProfile(input: ProfileDiagnosisInput): ProfileProblem[] {
    if (!input.modded) return [];

    const byId = new Map(input.mods.map(mod => [mod.id, mod]));
    const problems: ProfileProblem[] = [];

    for (const id of input.modIds) {
        if (input.downloading.includes(id)) continue;

        const mod = byId.get(id);
        if (mod === undefined) {
            problems.push({
                kind: "mod-absent",
                modId: id,
                headline: `"${id}" is not in the mods folder`,
                reasons: [],
                blocksLaunch: true,
            });
            continue;
        }

        if (!mod.ok) {
            problems.push({
                kind: "mod-invalid",
                modId: id,
                headline: `"${id}" cannot be loaded`,
                reasons: [...mod.errors],
                blocksLaunch: true,
            });
        }
    }

    const runtimes = input.modIds.filter(id => {
        const mod = byId.get(id);
        return mod !== undefined && mod.ok && mod.isRuntime;
    });

    if (runtimes.length > 1) {
        problems.push({
            kind: "runtime-multiple",
            modId: null,
            headline: `A profile can only have one runtime mod, and this one has ${runtimes.length}`,
            reasons: runtimes.map(id => `"${id}" is a runtime mod`),
            blocksLaunch: true,
        });
        return problems;
    }

    // Only when nothing else explains it. A runtime mod that failed validation is not counted
    // above, so saying "no runtime mod" here as well would report the same fault twice and lead
    // with the version that has no fix attached to it.
    if (runtimes.length === 0 && problems.length === 0) {
        problems.push({
            kind: "runtime-absent",
            modId: null,
            headline: "A modded profile needs a runtime mod, and this one has none",
            reasons: ["Add a runtime mod to this profile, or turn mods off for it."],
            blocksLaunch: true,
        });
    }

    return problems;
}

/** The one to lead with. Order is the order they were found, so causes precede consequences. */
export function launchBlocker(problems: readonly ProfileProblem[]): ProfileProblem | null {
    return problems.find(problem => problem.blocksLaunch) ?? null;
}

export function problemFor(problems: readonly ProfileProblem[], modId: string): ProfileProblem | null {
    return problems.find(problem => problem.modId === modId) ?? null;
}

/** Headline plus reasons, for somewhere with room for both. */
export function describeProblem(problem: ProfileProblem): string {
    return problem.reasons.length === 0
        ? problem.headline
        : `${problem.headline}\n\n${problem.reasons.join("\n")}`;
}

/** Every problem, for a banner that has to stand in for all of them at once. */
export function describeProblems(problems: readonly ProfileProblem[]): string {
    return problems.map(describeProblem).join("\n\n");
}
