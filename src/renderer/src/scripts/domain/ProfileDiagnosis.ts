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

import { prerelease, satisfies, valid } from "semver";

export type ProfileProblemKind =
    /** Listed by the profile, but the mods folder holds no such mod. */
    | "mod-absent"
    /** Present, but its mod.json was rejected. `reasons` carries what the validator said. */
    | "mod-invalid"
    /** Modded, and nothing it lists declares itself a runtime. */
    | "runtime-absent"
    /** No runtime yet, but a mod it lists is still downloading, so one may be on its way. */
    | "runtime-downloading"
    /** Modded, and more than one of its mods declares itself a runtime. */
    | "runtime-multiple"
    /** A mod requires another mod the profile does not have; the runtime aborts the load. */
    | "dependency-missing"
    /** The required mod is here, at a version outside the range asked for; the runtime aborts the load. */
    | "dependency-version";

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

/** A mod.json dependency in the terms the runtime matches it by (`ModDependency::MatchesMod`). */
export interface ModDependencyStatus {
    /** Empty when the dependency names only a namespace. */
    uuid: string;
    /** Empty when the dependency names only a uuid. */
    namespace: string;
    versionRange: string;
    isSoft: boolean;
}

/** What the mods folder scan already knows, narrowed to what a diagnosis needs. */
export interface ModStatus {
    id: string;
    ok: boolean;
    isRuntime: boolean;
    errors: readonly string[];
    /** Only known for a mod whose config was read; the runtime matches dependencies against these. */
    uuid?: string;
    namespace?: string;
    version?: string;
    dependencies?: readonly ModDependencyStatus[];
}

function dependencyMatches(dependency: ModDependencyStatus, mod: ModStatus): boolean {
    if (dependency.uuid !== "" && dependency.uuid !== mod.uuid) return false;
    if (dependency.namespace !== "" && dependency.namespace !== mod.namespace) return false;
    return true;
}

function dependencyName(dependency: ModDependencyStatus): string {
    return dependency.namespace || dependency.uuid || "another mod";
}

/**
 * The range grammar the runtime's semver library accepts: comparators joined by whitespace, sets
 * of them joined by `||`, and nothing else. No `^`, no `~`, no `1.2.x`, no `1.2.3 - 2.3.4`.
 */
const COMPARATOR =
    /^(<=|>=|<|>|=)? *((0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?)/;

/** Every character the runtime's lexer knows. One it does not know fails the whole range. */
const LEXABLE = /^[0-9A-Za-z .+\-|<>=]*$/;

/** What the runtime falls back to for a range it could not read, which accepts any release. */
const ANY_RELEASE = ">=0.0.0";

/**
 * The dependency's range as node-semver reads it, resolved the way the runtime resolves it.
 *
 * The runtime reads a comparator set and stops at the first token that cannot continue one,
 * ignoring whatever follows, so `1.2.3 - 2.3.4` is the single comparator `=1.2.3` there. A range
 * it cannot begin to read becomes `>=0.0.0`, and so does an empty one.
 */
function runtimeRange(text: string): string {
    if (!LEXABLE.test(text)) return ANY_RELEASE;

    const sets: string[] = [];
    let rest = text;

    for (;;) {
        const comparators: string[] = [];

        for (;;) {
            rest = rest.replace(/^ +/, "");
            const match = COMPARATOR.exec(rest);
            if (match === null) return ANY_RELEASE;

            comparators.push(`${match[1] ?? "="}${match[2]}`);
            rest = rest.slice(match[0].length).replace(/^ +/, "");
            if (!/^[<>=0-9]/.test(rest)) break;
        }

        sets.push(comparators.join(" "));
        if (!rest.startsWith("||")) break;
        rest = rest.slice(2);
    }

    return sets.join(" || ");
}

/**
 * `ModDependency::MatchesVersion`: a `dev` build answers every requirement, and every other
 * version is put to the range, which excludes prereleases the range did not name itself.
 */
function versionSatisfies(dependency: ModDependencyStatus, mod: ModStatus): boolean {
    const version = mod.version;
    if (version === undefined || valid(version) === null) return true;
    if ((prerelease(version) ?? []).join(".") === "dev") return true;
    return satisfies(version, runtimeRange(dependency.versionRange ?? ""));
}

function installedVersions(providers: readonly ModStatus[]): string {
    return providers.map(provider => provider.version ?? "an unknown version").join(", ");
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
    const arriving = input.modIds.filter(id => input.downloading.includes(id));

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

    const present = input.modIds
        .map(id => byId.get(id))
        .filter((mod): mod is ModStatus => mod !== undefined && mod.ok);

    // The runtime resolves dependencies only against the mods the launcher named in the session,
    // and aborts the load when a required one is not among them. Nothing downstream of here would
    // say why, so it has to be said before the game starts.
    if (arriving.length === 0) {
        for (const mod of present) {
            for (const dependency of mod.dependencies ?? []) {
                if (dependency.isSoft) continue;

                const providers = present.filter(candidate => dependencyMatches(dependency, candidate));

                if (providers.length === 0) {
                    problems.push({
                        kind: "dependency-missing",
                        modId: mod.id,
                        headline: `"${mod.id}" needs ${dependencyName(dependency)}, which this profile does not have`,
                        reasons: [
                            `"${mod.id}" requires ${dependencyName(dependency)} ${dependency.versionRange}.`,
                            "Add it to this profile, or the game will stop while loading.",
                        ],
                        blocksLaunch: true,
                    });
                    continue;
                }

                if (providers.some(provider => versionSatisfies(dependency, provider))) continue;

                problems.push({
                    kind: "dependency-version",
                    modId: mod.id,
                    headline: `"${mod.id}" needs ${dependencyName(dependency)} ${dependency.versionRange}, and this profile has ${installedVersions(providers)}`,
                    reasons: [
                        `"${mod.id}" requires ${dependencyName(dependency)} ${dependency.versionRange}.`,
                        ...providers.map(provider => `"${provider.id}" is version ${provider.version ?? "unknown"}.`),
                        "Install a version in that range, or the game will stop while loading.",
                    ],
                    blocksLaunch: true,
                });
            }
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
        problems.push(
            arriving.length > 0
                ? {
                    kind: "runtime-downloading",
                    modId: null,
                    headline: "Still installing the mods this profile needs",
                    reasons: [`Waiting for ${arriving.map(id => `"${id}"`).join(", ")} to finish downloading.`],
                    blocksLaunch: true,
                }
                : {
                    kind: "runtime-absent",
                    modId: null,
                    headline: "A modded profile needs a runtime mod, and this one has none",
                    reasons: ["Add a runtime mod to this profile, or turn mods off for it."],
                    blocksLaunch: true,
                }
        );
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
