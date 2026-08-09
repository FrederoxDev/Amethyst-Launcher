import assert from "node:assert/strict";
import { describe, it } from "node:test";

import type { LaunchFacts } from "../src/renderer/src/scripts/platform/windows/LaunchDiagnostics.ts";
import {
    ACTIVATION_SUCCESS_HRESULT,
    classifyBuild,
    classifyLaunch,
    classifyMachineReadiness,
    describeHresult,
    isOurGame,
    launchFailureMessage,
    nextStepForHresult,
    normalisePath,
    normaliseHresult,
    parentPath,
} from "../src/renderer/src/scripts/platform/windows/LaunchDiagnostics.ts";

const BUILD = "C:\\Users\\t\\AppData\\Roaming\\Amethyst\\Launcher\\Versions\\1.21.0-release";

function facts(overrides: Partial<LaunchFacts> = {}): LaunchFacts {
    return {
        versionPath: BUILD,
        hresult: ACTIVATION_SUCCESS_HRESULT,
        activationPid: 0,
        activationPidAlive: false,
        usedShellFallback: false,
        shellSpawnError: "",
        processes: [],
        probeFailed: false,
        ...overrides,
    };
}

describe("hresult reading", () => {
    it("normalises whatever case PowerShell formatted the code in", () => {
        assert.equal(normaliseHresult("0X8027025B"), "0x8027025B");
        assert.equal(normaliseHresult("  0x8027025b  "), "0x8027025B");
        assert.equal(normaliseHresult(null), "");
        assert.equal(normaliseHresult(undefined), "");
    });

    it("explains a documented code and admits when a code is undocumented", () => {
        assert.match(describeHresult("0x80270254"), /E_APPLICATION_NOT_REGISTERED/);
        assert.match(describeHresult("0x8027025b"), /E_APPLICATION_ACTIVATION_EXEC_FAILURE/);
        assert.equal(describeHresult("0xDEADBEEF"), "no documented meaning for this code");
    });

    it("gives a different action for codes that need a different action", () => {
        assert.match(nextStepForHresult("0x80270251"), /administrator/i);
        assert.match(nextStepForHresult("0x80270252"), /User Account Control/);
        assert.match(nextStepForHresult("0x8027025C"), /sign in/i);
        assert.notEqual(nextStepForHresult("0x80270251"), nextStepForHresult("0x80270252"));
    });

    it("never leaves an unknown code without something to do", () => {
        assert.notEqual(nextStepForHresult("0xDEADBEEF").trim(), "");
        assert.equal(nextStepForHresult("0xDEADBEEF"), nextStepForHresult(""));
    });
});

describe("machine readiness", () => {
    it("passes a machine with Developer Mode on and no policy block", () => {
        const verdict = classifyMachineReadiness({ developerMode: true, sideloadingBlockedByPolicy: false });
        assert.equal(verdict.kind, "ready");
    });

    it("reports the policy block first, because turning Developer Mode on cannot beat it", () => {
        const verdict = classifyMachineReadiness({ developerMode: false, sideloadingBlockedByPolicy: true });
        assert.equal(verdict.kind, "sideloading-blocked");
        assert.match(verdict.nextStep, /administrator/i);
    });

    it("asks for Developer Mode when only that is missing", () => {
        const verdict = classifyMachineReadiness({ developerMode: false, sideloadingBlockedByPolicy: false });
        assert.equal(verdict.kind, "developer-mode-off");
        assert.match(verdict.nextStep, /For developers/);
    });

    it("keeps a route that needs no launcher, for a repair that does not take", () => {
        for (const developerMode of [true, false]) {
            for (const sideloadingBlockedByPolicy of [true, false]) {
                const verdict = classifyMachineReadiness({ developerMode, sideloadingBlockedByPolicy });
                if (verdict.kind === "ready") continue;
                assert.notEqual(verdict.manualStep.trim(), "", `${verdict.kind} has no by-hand route`);
                assert.match(verdict.manualStep, /press Play again/, `${verdict.kind} does not say what to do after`);
                assert.doesNotMatch(verdict.manualStep, /permission prompt/, `${verdict.kind} still expects a prompt`);
            }
        }
    });
});

describe("build integrity", () => {
    it("accepts a build that holds both files", () => {
        assert.equal(
            classifyBuild({ folderExists: true, gameExecutable: true, manifest: true }).kind,
            "usable"
        );
    });

    it("separates a folder that is gone from one that is short of files", () => {
        assert.equal(
            classifyBuild({ folderExists: false, gameExecutable: false, manifest: false }).kind,
            "folder-missing"
        );
        assert.equal(
            classifyBuild({ folderExists: true, gameExecutable: false, manifest: true }).kind,
            "files-missing"
        );
        assert.equal(
            classifyBuild({ folderExists: true, gameExecutable: true, manifest: false }).kind,
            "files-missing"
        );
    });

    it("names which of the two files is missing", () => {
        const noGame = classifyBuild({ folderExists: true, gameExecutable: false, manifest: true });
        assert.match(noGame.headline, /the game itself/);
        assert.doesNotMatch(noGame.headline, /Windows needs/);

        const neither = classifyBuild({ folderExists: true, gameExecutable: false, manifest: false });
        assert.match(neither.headline, /the game itself and/);
    });
});

describe("path comparison", () => {
    it("ignores case, separator shape and a trailing separator", () => {
        assert.equal(normalisePath("C:/Games/MC/"), "c:\\games\\mc");
        assert.equal(normalisePath("C:\\\\Games\\\\MC"), "c:\\games\\mc");
    });

    it("takes the folder a file sits in", () => {
        assert.equal(parentPath("C:\\Games\\MC\\Minecraft.Windows.exe"), "c:\\games\\mc");
    });

    it("counts a process out of the expected build, and one whose path Windows withheld", () => {
        assert.equal(isOurGame({ pid: 1, executablePath: `${BUILD}\\Minecraft.Windows.exe` }, BUILD), true);
        assert.equal(isOurGame({ pid: 2, executablePath: "" }, BUILD), true);
        assert.equal(isOurGame({ pid: 3, executablePath: "D:\\Other\\Minecraft.Windows.exe" }, BUILD), false);
    });
});

describe("launch outcome", () => {
    it("calls it running when the game is there, whatever else happened", () => {
        const verdict = classifyLaunch(facts({
            hresult: "0x8027025B",
            processes: [{ pid: 42, executablePath: `${BUILD}\\Minecraft.Windows.exe` }],
        }));
        assert.equal(verdict.kind, "running");
        assert.equal(verdict.started, true);
    });

    it("counts a game on screen over the process id Windows named and that has since gone", () => {
        const verdict = classifyLaunch(facts({
            activationPid: 5150,
            activationPidAlive: false,
            shellSpawnError: "spawn explorer.exe ENOENT",
            processes: [{ pid: 42, executablePath: `${BUILD}\\Minecraft.Windows.exe` }],
        }));
        assert.equal(verdict.kind, "running");
    });

    it("does not fail a launch it could not check", () => {
        const stillThere = classifyLaunch(facts({ probeFailed: true, activationPid: 900, activationPidAlive: true }));
        assert.equal(stillThere.kind, "unverified");
        assert.equal(stillThere.started, true);

        const nothingNamed = classifyLaunch(facts({ probeFailed: true }));
        assert.equal(nothingNamed.kind, "unverified");
        assert.equal(nothingNamed.started, true);
    });

    it("still calls a named process that has died a crash when the process list is unreadable", () => {
        const verdict = classifyLaunch(facts({ probeFailed: true, activationPid: 900, activationPidAlive: false }));
        assert.equal(verdict.kind, "exited-immediately");
        assert.equal(verdict.started, false);
    });

    it("does not report a success when neither way of asking got anywhere and nothing can be checked", () => {
        const verdict = classifyLaunch(facts({
            probeFailed: true,
            hresult: "0x80270254",
            usedShellFallback: true,
            shellSpawnError: "spawn explorer.exe ENOENT",
        }));
        assert.equal(verdict.kind, "activation-refused");
        assert.equal(verdict.started, false);
    });

    it("does not say Windows refused a request it accepted", () => {
        const verdict = classifyLaunch(facts({
            usedShellFallback: true,
            shellSpawnError: "spawn explorer.exe ENOENT",
        }));
        assert.equal(verdict.kind, "activation-refused");
        assert.doesNotMatch(verdict.summary, /refused/);
        assert.match(verdict.summary, /accepted/);
    });

    it("blames Windows only when Windows actually refused", () => {
        const verdict = classifyLaunch(facts({ hresult: "0x80270254" }));
        assert.equal(verdict.kind, "activation-refused");
        assert.equal(verdict.started, false);
        assert.match(verdict.headline, /0x80270254/);
        assert.equal(verdict.nextStep, nextStepForHresult("0x80270254"));
    });

    it("records that the shell was tried after a refusal, so the log says both were", () => {
        const verdict = classifyLaunch(facts({ hresult: "0x80270254", usedShellFallback: true }));
        assert.match(verdict.summary, /shell was asked instead/);
        assert.doesNotMatch(
            classifyLaunch(facts({ hresult: "0x80270254" })).summary,
            /shell was asked instead/
        );
    });

    it("reports a shell fallback that could not even start", () => {
        const verdict = classifyLaunch(facts({
            hresult: "0x80070005",
            usedShellFallback: true,
            shellSpawnError: "spawn explorer.exe ENOENT",
        }));
        assert.equal(verdict.kind, "activation-refused");
        assert.match(verdict.summary, /ENOENT/);
    });

    it("reports an activation call that never returned a result at all", () => {
        const verdict = classifyLaunch(facts({ hresult: "" }));
        assert.equal(verdict.kind, "activation-refused");
        assert.match(verdict.headline, /could not be asked/);
    });

    it("calls a process that Windows made and that died a crash, and does not blame Windows", () => {
        const verdict = classifyLaunch(facts({ activationPid: 5150, activationPidAlive: false }));
        assert.equal(verdict.kind, "exited-immediately");
        assert.match(verdict.nextStep, /mods/);
        assert.doesNotMatch(verdict.headline, /Windows/);
    });

    it("separates a process that is still running but is not the game", () => {
        const verdict = classifyLaunch(facts({ activationPid: 5150, activationPidAlive: true }));
        assert.equal(verdict.kind, "foreign-process");
        assert.match(verdict.nextStep, /5150/);
    });

    it("separates a Minecraft running from another build", () => {
        const verdict = classifyLaunch(facts({
            processes: [{ pid: 77, executablePath: "D:\\Other\\Minecraft.Windows.exe" }],
        }));
        assert.equal(verdict.kind, "other-build-running");
        assert.match(verdict.nextStep, /Close/);
    });

    it("reports an accepted request that produced nothing at all", () => {
        const verdict = classifyLaunch(facts());
        assert.equal(verdict.kind, "no-process-created");
        assert.match(verdict.headline, /never actually started/);
    });

    it("prefers the crash over a stranger's Minecraft, because the crash is this launch's", () => {
        const verdict = classifyLaunch(facts({
            activationPid: 5150,
            activationPidAlive: false,
            processes: [{ pid: 77, executablePath: "D:\\Other\\Minecraft.Windows.exe" }],
        }));
        assert.equal(verdict.kind, "exited-immediately");
    });

    it("never dead-ends: every failure says what happened and what to do, in plain words", () => {
        const cases: LaunchFacts[] = [
            facts({ probeFailed: true }),
            facts({ hresult: "" }),
            facts({ hresult: "0x80270254" }),
            facts({ hresult: "0xDEADBEEF" }),
            facts({ usedShellFallback: true, shellSpawnError: "no explorer" }),
            facts({ activationPid: 1, activationPidAlive: false }),
            facts({ activationPid: 1, activationPidAlive: true }),
            facts({ processes: [{ pid: 2, executablePath: "D:\\Other\\Minecraft.Windows.exe" }] }),
            facts({ probeFailed: true, activationPid: 1, activationPidAlive: false }),
            facts({ probeFailed: true, usedShellFallback: true, shellSpawnError: "no explorer" }),
            facts(),
        ];

        for (const input of cases) {
            const verdict = classifyLaunch(input);
            assert.notEqual(verdict.summary.trim(), "", `${verdict.kind} has no summary`);
            assert.notEqual(verdict.headline.trim(), "", `${verdict.kind} has no headline`);
            assert.notEqual(verdict.nextStep.trim(), "", `${verdict.kind} has no next step`);

            const message = launchFailureMessage(verdict);
            assert.ok(message.includes(verdict.nextStep), `${verdict.kind} drops its next step`);
            assert.doesNotMatch(message, /\u2014/, `${verdict.kind} uses an em-dash`);
        }
    });
});
