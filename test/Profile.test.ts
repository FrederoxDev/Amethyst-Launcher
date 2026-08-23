import assert from "node:assert/strict";
import { describe, it } from "node:test";

type ProfileModule = typeof import("../src/renderer/src/scripts/domain/Profile.ts");
type Profile = import("../src/renderer/src/scripts/domain/Profile.ts").Profile;

const MODULE_URL = new URL("../src/renderer/src/scripts/domain/Profile.ts", import.meta.url).href;

let Module: ProfileModule = undefined as unknown as ProfileModule;
let blocked = "";
try {
    Module = await import(MODULE_URL) as ProfileModule;
} catch (e) {
    blocked = `Profile.ts cannot be loaded by node --test: ${(e as Error).message}`;
}
const gate = blocked ? { skip: blocked } : {};

const WHERE = "profiles.json[2]";

function saved(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        uuid: "d9f1c6e2-0000-4000-8000-000000000001",
        name: "Modded",
        channel: "release",
        versionUuid: "b1a2c3d4-0000-4000-8000-000000000002",
        versionLabel: "Release 1.21.0.3",
        modded: true,
        mods: ["Create", "JEI"],
        ...overrides,
    };
}

function parse(overrides: Record<string, unknown> = {}): Profile {
    return Module.parseProfile(saved(overrides), WHERE);
}

function rejects(overrides: Record<string, unknown>, message: RegExp): void {
    assert.throws(() => parse(overrides), message);
}

describe("parsing a saved profile", gate, () => {
    it("reads back every field of a complete profile", () => {
        assert.deepEqual(parse(), {
            uuid: "d9f1c6e2-0000-4000-8000-000000000001",
            name: "Modded",
            channel: "release",
            versionUuid: "b1a2c3d4-0000-4000-8000-000000000002",
            versionLabel: "Release 1.21.0.3",
            modded: true,
            mods: ["Create", "JEI"],
        });
    });

    it("keeps only the fields the profile shape declares", () => {
        const profile = parse({ favourite: true, lastPlayed: "2026-01-01" }) as Record<string, unknown>;
        assert.deepEqual(Object.keys(profile).sort(), [
            "channel", "modded", "mods", "name", "uuid", "versionLabel", "versionUuid",
        ]);
    });

    it("accepts a profile that has not chosen a version yet", () => {
        const profile = parse({ versionUuid: "", versionLabel: "" });
        assert.equal(profile.versionUuid, "");
        assert.equal(profile.versionLabel, "");
    });

    it("accepts a profile with no mods", () => {
        assert.deepEqual(parse({ mods: [] }).mods, []);
    });

    it("accepts the preview channel", () => {
        assert.equal(parse({ channel: "preview" }).channel, "preview");
    });

    it("names the file and index in every rejection", () => {
        assert.throws(() => Module.parseProfile(null, WHERE), /profiles\.json\[2\]: /);
        assert.throws(() => parse({ uuid: "" }), /profiles\.json\[2\]: /);
    });

    it("rejects a profile that is not an object", () => {
        for (const raw of [null, undefined, "profile", 7, true]) {
            assert.throws(() => Module.parseProfile(raw, WHERE), /profile is not an object/, `accepted ${String(raw)}`);
        }
    });

    it("rejects an empty uuid or name", () => {
        rejects({ uuid: "" }, /"uuid" must not be empty/);
        rejects({ name: "" }, /"name" must not be empty/);
    });

    it("rejects a non-string where a string belongs", () => {
        rejects({ uuid: 12 }, /"uuid" must be a string/);
        rejects({ name: null }, /"name" must be a string/);
        rejects({ versionUuid: undefined }, /"versionUuid" must be a string/);
        rejects({ versionLabel: 0 }, /"versionLabel" must be a string/);
    });

    it("rejects a channel that is not release or preview", () => {
        for (const channel of ["Release", "beta", "", null, undefined, 1]) {
            rejects({ channel }, /"channel" must be "release" or "preview"/);
        }
    });

    it("rejects mods that are not an array of strings", () => {
        rejects({ mods: undefined }, /"mods" must be an array of strings/);
        rejects({ mods: "Create" }, /"mods" must be an array of strings/);
        rejects({ mods: { Create: true } }, /"mods" must be an array of strings/);
        rejects({ mods: ["Create", 3] }, /"mods" must be an array of strings/);
        rejects({ mods: ["Create", null] }, /"mods" must be an array of strings/);
    });

    // An array is an object, so the shape check lets one through and the channel check catches it.
    it("rejects an array as a profile whose channel is missing", () => {
        assert.throws(() => Module.parseProfile([], WHERE), /"channel" must be "release" or "preview"/);
    });

    it("blames the channel before any missing string field", () => {
        assert.throws(
            () => Module.parseProfile({ channel: "nightly" }, WHERE),
            /"channel" must be "release" or "preview"/
        );
    });
});

describe("recovering the modded choice from a saved profile", gate, () => {
    it("takes the stored choice when the profile carries one", () => {
        assert.equal(parse({ modded: true, mods: [] }).modded, true);
        assert.equal(parse({ modded: false, mods: ["Create"] }).modded, false);
    });

    it("calls a profile written before the flag modded if it lists any mod", () => {
        const profile = saved({ mods: ["Create"] });
        delete profile.modded;
        assert.equal(Module.parseProfile(profile, WHERE).modded, true);
    });

    it("recovers the choice from the runtime name an older launcher stored", () => {
        const legacy = (runtime: unknown): boolean => {
            const profile = saved({ mods: [], runtime });
            delete profile.modded;
            return Module.parseProfile(profile, WHERE).modded;
        };

        assert.equal(legacy("Amethyst-Runtime"), true);
        assert.equal(legacy("Vanilla"), false);
        assert.equal(legacy("vanilla"), false);
        assert.equal(legacy("  VANILLA  "), false);
        assert.equal(legacy(""), false);
        assert.equal(legacy(undefined), false);
        assert.equal(legacy(7), false);
    });

    it("falls back to the older shape rather than rejecting a non-boolean flag", () => {
        assert.equal(parse({ modded: "true", mods: [] }).modded, false);
        assert.equal(parse({ modded: 1, mods: ["Create"] }).modded, true);
    });

    it("reports the stored choice and nothing else", () => {
        const profile = (over: Partial<Profile>): Profile => ({ ...parse(), ...over });

        assert.equal(Module.isModded(profile({ modded: true, mods: [] })), true);
        assert.equal(Module.isModded(profile({ modded: false, mods: ["Create"] })), false);
    });
});
