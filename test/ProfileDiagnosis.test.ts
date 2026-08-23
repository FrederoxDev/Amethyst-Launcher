import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type {
    ModDependencyStatus,
    ModStatus,
    ProfileDiagnosisInput,
} from "../src/renderer/src/scripts/domain/ProfileDiagnosis.ts";
import {
    describeProblem,
    diagnoseProfile,
    launchBlocker,
    problemFor,
} from "../src/renderer/src/scripts/domain/ProfileDiagnosis.ts";

const mod = (id: string, over: Partial<ModStatus> = {}): ModStatus => ({
    id,
    ok: true,
    isRuntime: false,
    errors: [],
    ...over,
});

const input = (over: Partial<ProfileDiagnosisInput> = {}): ProfileDiagnosisInput => ({
    modded: true,
    modIds: [],
    mods: [],
    downloading: [],
    ...over,
});

describe("profile diagnosis", () => {
    it("says nothing about an unmodded profile", () => {
        assert.deepEqual(diagnoseProfile(input({ modded: false, modIds: ["anything"] })), []);
    });

    it("accepts a profile with exactly one runtime", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create"],
                mods: [mod("Amethyst-Runtime", { isRuntime: true }), mod("Create")],
            })
        );
        assert.deepEqual(problems, []);
    });

    it("carries the validator's own words for a mod it rejected", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Create"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true }),
                    mod("Create", { ok: false, errors: ['format_version "1.2.0" can no longer be run'] }),
                ],
            })
        );

        const problem = problemFor(problems, "Create");
        assert.equal(problem?.kind, "mod-invalid");
        assert.deepEqual(problem?.reasons, ['format_version "1.2.0" can no longer be run']);
        assert.match(describeProblem(problem!), /1\.2\.0/);
    });

    // The bug this module was written for: an invalid runtime is not a missing runtime, and
    // reporting it as one sent the user looking for a mod that was sitting right there.
    it("blames the invalid runtime rather than claiming the profile has none", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime"],
                mods: [mod("Amethyst-Runtime", { isRuntime: true, ok: false, errors: ["outdated"] })],
            })
        );

        assert.equal(problems.length, 1);
        assert.equal(problems[0].kind, "mod-invalid");
        assert.ok(!problems.some(p => p.kind === "runtime-absent"));
    });

    it("reports a missing runtime when every mod it has is valid", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Create"],
                mods: [mod("Create")],
            })
        );
        assert.equal(problems[0].kind, "runtime-absent");
    });

    it("separates a mod that is absent from one that is present and broken", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Gone", "Broken"],
                mods: [mod("Broken", { ok: false, errors: ["bad json"] })],
            })
        );
        assert.equal(problemFor(problems, "Gone")?.kind, "mod-absent");
        assert.equal(problemFor(problems, "Broken")?.kind, "mod-invalid");
    });

    it("does not fault a mod that is still downloading", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create"],
                mods: [mod("Amethyst-Runtime", { isRuntime: true })],
                downloading: ["Create"],
            })
        );
        assert.deepEqual(problems, []);
    });

    // Telling a user to install the thing they are installing is the one thing this must not do.
    it("says the runtime is on its way rather than absent while it downloads", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime"],
                mods: [],
                downloading: ["Amethyst-Runtime"],
            })
        );

        assert.equal(problems.length, 1);
        assert.equal(problems[0].kind, "runtime-downloading");
        assert.ok(describeProblem(problems[0]).includes("Amethyst-Runtime"));
        assert.ok(!problems.some(p => p.kind === "runtime-absent"));
    });

    it("waits rather than faulting while any listed mod could still turn out to be the runtime", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Create", "Sodium"],
                mods: [mod("Create")],
                downloading: ["Sodium"],
            })
        );
        assert.equal(problems[0].kind, "runtime-downloading");
    });

    it("names the mod whose required dependency the profile does not have", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                    mod("Create", {
                        uuid: "create-uuid",
                        namespace: "create",
                        dependencies: [
                            { uuid: "flywheel-uuid", namespace: "flywheel", versionRange: ">=1.0.0", isSoft: false },
                        ],
                    }),
                ],
            })
        );

        const problem = problemFor(problems, "Create");
        assert.equal(problem?.kind, "dependency-missing");
        assert.ok(describeProblem(problem!).includes("flywheel"));
    });

    it("accepts a dependency satisfied by another mod in the profile", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create", "Flywheel"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                    mod("Create", {
                        uuid: "create-uuid",
                        namespace: "create",
                        dependencies: [
                            { uuid: "flywheel-uuid", namespace: "flywheel", versionRange: ">=1.0.0", isSoft: false },
                        ],
                    }),
                    mod("Flywheel", { uuid: "flywheel-uuid", namespace: "flywheel" }),
                ],
            })
        );
        assert.deepEqual(problems, []);
    });

    it("ignores a soft dependency, which the runtime loads without", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                    mod("Create", {
                        uuid: "create-uuid",
                        namespace: "create",
                        dependencies: [
                            { uuid: "optional-uuid", namespace: "optional", versionRange: ">=1.0.0", isSoft: true },
                        ],
                    }),
                ],
            })
        );
        assert.deepEqual(problems, []);
    });

    it("does not accuse a mod of a missing dependency that is still downloading", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create", "Flywheel"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                    mod("Create", {
                        uuid: "create-uuid",
                        namespace: "create",
                        dependencies: [
                            { uuid: "flywheel-uuid", namespace: "flywheel", versionRange: ">=1.0.0", isSoft: false },
                        ],
                    }),
                ],
                downloading: ["Flywheel"],
            })
        );
        assert.deepEqual(problems, []);
    });

    it("reports more than one runtime, naming them", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["A", "B"],
                mods: [mod("A", { isRuntime: true }), mod("B", { isRuntime: true })],
            })
        );
        assert.equal(problems[0].kind, "runtime-multiple");
        assert.ok(problems[0].reasons.some(r => r.includes("A")));
        assert.ok(problems[0].reasons.some(r => r.includes("B")));
    });

    it("leads with the cause, not the consequence", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create"],
                mods: [mod("Amethyst-Runtime", { isRuntime: true, ok: false, errors: ["outdated"] }), mod("Create")],
            })
        );
        assert.equal(launchBlocker(problems)?.modId, "Amethyst-Runtime");
    });

    it("never dead-ends: every problem says something, and blocking ones say what to do", () => {
        const cases: ProfileDiagnosisInput[] = [
            input({ modIds: ["Gone"], mods: [] }),
            input({ modIds: ["Broken"], mods: [mod("Broken", { ok: false, errors: ["bad"] })] }),
            input({ modIds: ["Create"], mods: [mod("Create")] }),
            input({ modIds: ["A", "B"], mods: [mod("A", { isRuntime: true }), mod("B", { isRuntime: true })] }),
        ];

        for (const c of cases) {
            const problems = diagnoseProfile(c);
            assert.ok(problems.length > 0);
            for (const problem of problems) {
                assert.ok(problem.headline.trim().length > 0);
                assert.ok(!problem.headline.includes("—"));
                assert.ok(describeProblem(problem).trim().length > 0);
            }
        }
    });
});

describe("dependency version ranges", () => {
    const profile = (
        dependency: ModDependencyStatus,
        provider: Partial<ModStatus> | null,
        over: Partial<ProfileDiagnosisInput> = {}
    ): ProfileDiagnosisInput =>
        input({
            modIds: provider === null ? ["Amethyst-Runtime", "Create"] : ["Amethyst-Runtime", "Create", "Flywheel"],
            mods: [
                mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                mod("Create", {
                    uuid: "create-uuid",
                    namespace: "create",
                    version: "1.0.0",
                    dependencies: [dependency],
                }),
                ...(provider === null
                    ? []
                    : [mod("Flywheel", { uuid: "flywheel-uuid", namespace: "flywheel", ...provider })]),
            ],
            ...over,
        });

    const requires = (versionRange: string, isSoft = false): ModDependencyStatus => ({
        uuid: "flywheel-uuid",
        namespace: "flywheel",
        versionRange,
        isSoft,
    });

    it("accepts an installed version inside the range", () => {
        assert.deepEqual(diagnoseProfile(profile(requires(">=1.0.0 <2.0.0"), { version: "1.4.2" })), []);
    });

    it("accepts a version in either half of an alternation", () => {
        assert.deepEqual(diagnoseProfile(profile(requires(">=1.0.0 <2.0.0 || >=3.0.0"), { version: "3.1.0" })), []);
    });

    // What the launcher used to miss: present, so not missing, and rejected by the runtime anyway.
    it("reports an installed version outside the range", () => {
        const problems = diagnoseProfile(profile(requires(">=2.0.0"), { version: "1.4.2" }));

        const problem = problemFor(problems, "Create");
        assert.equal(problem?.kind, "dependency-version");
        assert.equal(problem?.blocksLaunch, true);
    });

    it("says who needs what, what was asked for, and what is installed", () => {
        const problems = diagnoseProfile(profile(requires(">=2.0.0"), { version: "1.4.2" }));
        const told = describeProblem(problemFor(problems, "Create")!);

        assert.match(told, /Create/);
        assert.match(told, /flywheel/);
        assert.match(told, />=2\.0\.0/);
        assert.match(told, /1\.4\.2/);
    });

    it("asks nothing of the version when the dependency states no range", () => {
        assert.deepEqual(diagnoseProfile(profile(requires(""), { version: "0.1.0" })), []);
    });

    // The runtime cannot read `^`, `~` or `1.2.x`, and falls back to `>=0.0.0` for them, so the
    // launcher must not enforce a range the load will never apply.
    it("asks nothing of the version when the range is one the runtime cannot read", () => {
        for (const range of ["^2.0.0", "~2.0.0", "2.x", "latest"]) {
            assert.deepEqual(diagnoseProfile(profile(requires(range), { version: "1.4.2" })), [], range);
        }
    });

    it("lets a dev build answer any range, as ModDependency::MatchesVersion does", () => {
        assert.deepEqual(diagnoseProfile(profile(requires(">=2.0.0"), { version: "1.4.2-dev" })), []);
    });

    it("holds a prerelease to the range unless the range named one itself", () => {
        assert.equal(
            diagnoseProfile(profile(requires(">=1.0.0"), { version: "2.0.0-beta.1" }))[0]?.kind,
            "dependency-version"
        );
        assert.deepEqual(diagnoseProfile(profile(requires(">=2.0.0-alpha"), { version: "2.0.0-beta.1" })), []);
    });

    it("ignores a soft dependency at the wrong version, which the runtime loads past", () => {
        assert.deepEqual(diagnoseProfile(profile(requires(">=2.0.0", true), { version: "1.4.2" })), []);
    });

    it("says nothing about versions while a listed mod is still downloading", () => {
        const problems = diagnoseProfile(
            profile(requires(">=2.0.0"), { version: "1.4.2" }, { downloading: ["Flywheel"] })
        );
        assert.deepEqual(problems, []);
    });

    it("still calls an absent dependency missing rather than wrongly versioned", () => {
        const problems = diagnoseProfile(profile(requires(">=2.0.0"), null));
        assert.equal(problemFor(problems, "Create")?.kind, "dependency-missing");
    });

    it("takes the satisfying one when more than one mod answers the dependency", () => {
        const problems = diagnoseProfile(
            input({
                modIds: ["Amethyst-Runtime", "Create", "Flywheel-Old", "Flywheel-New"],
                mods: [
                    mod("Amethyst-Runtime", { isRuntime: true, uuid: "runtime-uuid", namespace: "amethyst" }),
                    mod("Create", {
                        uuid: "create-uuid",
                        namespace: "create",
                        dependencies: [{ uuid: "", namespace: "flywheel", versionRange: ">=2.0.0", isSoft: false }],
                    }),
                    mod("Flywheel-Old", { uuid: "old-uuid", namespace: "flywheel", version: "1.0.0" }),
                    mod("Flywheel-New", { uuid: "new-uuid", namespace: "flywheel", version: "2.1.0" }),
                ],
            })
        );
        assert.deepEqual(problems, []);
    });
});
