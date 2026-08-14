import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { ModStatus, ProfileDiagnosisInput } from "../src/renderer/src/scripts/domain/ProfileDiagnosis.ts";
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
        const problems = diagnoseProfile(input({
            modIds: ["Amethyst-Runtime", "Create"],
            mods: [mod("Amethyst-Runtime", { isRuntime: true }), mod("Create")],
        }));
        assert.deepEqual(problems, []);
    });

    it("carries the validator's own words for a mod it rejected", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Create"],
            mods: [
                mod("Amethyst-Runtime", { isRuntime: true }),
                mod("Create", { ok: false, errors: ['format_version "1.2.0" can no longer be run'] }),
            ],
        }));

        const problem = problemFor(problems, "Create");
        assert.equal(problem?.kind, "mod-invalid");
        assert.deepEqual(problem?.reasons, ['format_version "1.2.0" can no longer be run']);
        assert.match(describeProblem(problem!), /1\.2\.0/);
    });

    // The bug this module was written for: an invalid runtime is not a missing runtime, and
    // reporting it as one sent the user looking for a mod that was sitting right there.
    it("blames the invalid runtime rather than claiming the profile has none", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Amethyst-Runtime"],
            mods: [mod("Amethyst-Runtime", { isRuntime: true, ok: false, errors: ["outdated"] })],
        }));

        assert.equal(problems.length, 1);
        assert.equal(problems[0].kind, "mod-invalid");
        assert.ok(!problems.some(p => p.kind === "runtime-absent"));
    });

    it("reports a missing runtime when every mod it has is valid", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Create"],
            mods: [mod("Create")],
        }));
        assert.equal(problems[0].kind, "runtime-absent");
    });

    it("separates a mod that is absent from one that is present and broken", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Gone", "Broken"],
            mods: [mod("Broken", { ok: false, errors: ["bad json"] })],
        }));
        assert.equal(problemFor(problems, "Gone")?.kind, "mod-absent");
        assert.equal(problemFor(problems, "Broken")?.kind, "mod-invalid");
    });

    it("does not fault a mod that is still downloading", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Amethyst-Runtime", "Create"],
            mods: [mod("Amethyst-Runtime", { isRuntime: true })],
            downloading: ["Create"],
        }));
        assert.deepEqual(problems, []);
    });

    it("reports more than one runtime, naming them", () => {
        const problems = diagnoseProfile(input({
            modIds: ["A", "B"],
            mods: [mod("A", { isRuntime: true }), mod("B", { isRuntime: true })],
        }));
        assert.equal(problems[0].kind, "runtime-multiple");
        assert.ok(problems[0].reasons.some(r => r.includes("A")));
        assert.ok(problems[0].reasons.some(r => r.includes("B")));
    });

    it("leads with the cause, not the consequence", () => {
        const problems = diagnoseProfile(input({
            modIds: ["Amethyst-Runtime", "Create"],
            mods: [
                mod("Amethyst-Runtime", { isRuntime: true, ok: false, errors: ["outdated"] }),
                mod("Create"),
            ],
        }));
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
