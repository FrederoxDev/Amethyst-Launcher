import assert from "node:assert/strict";
import { describe, it } from "node:test";

type InstalledVersionModule = typeof import("../src/renderer/src/scripts/versions/InstalledVersion.ts");

const MODULE_URL = new URL("../src/renderer/src/scripts/versions/InstalledVersion.ts", import.meta.url).href;

let Module: InstalledVersionModule = undefined as unknown as InstalledVersionModule;
let blocked = "";
try {
    Module = (await import(MODULE_URL)) as InstalledVersionModule;
} catch (e) {
    blocked = `InstalledVersion.ts cannot be loaded by node --test: ${(e as Error).message}`;
}
const gate = blocked ? { skip: blocked } : {};

const WHERE = "versions.json[0]";
const UUID = "3f2a1b4c-0000-4000-8000-00000000000a";

function saved(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
        uuid: UUID,
        label: "Release 1.21.0.3",
        channel: "release",
        version: "1.21.0.3",
        path: "C:\\Versions\\Minecraft-1.21.0.3-release-3f2a1b4c",
        packageFamily: "Microsoft.MinecraftUWP_8wekyb3d8bbwe",
        imported: false,
        ...overrides,
    };
}

function rejects(overrides: Record<string, unknown>, message: RegExp): void {
    assert.throws(() => Module.deserialize(saved(overrides), WHERE), message);
}

describe("reading a saved installed version", gate, () => {
    it("reads back every field of a complete entry", () => {
        const version = Module.deserialize(saved(), WHERE);

        assert.equal(version.uuid, UUID);
        assert.equal(version.label, "Release 1.21.0.3");
        assert.equal(version.channel, "release");
        assert.equal(version.path, "C:\\Versions\\Minecraft-1.21.0.3-release-3f2a1b4c");
        assert.equal(version.packageFamily, "Microsoft.MinecraftUWP_8wekyb3d8bbwe");
        assert.equal(version.imported, false);
        assert.deepEqual(
            [version.version.major, version.version.minor, version.version.patch, version.version.build],
            [1, 21, 0, 3]
        );
    });

    it("survives a round trip through serialize", () => {
        const once = Module.deserialize(saved(), WHERE);
        assert.deepEqual(Module.deserialize(Module.serialize(once), WHERE), once);
    });

    it("keeps the version string it was given", () => {
        assert.equal(Module.deserialize(saved({ version: "1.21.0.3" }), WHERE).version.toString(), "1.21.0.3");
    });

    it("fills in a build of zero for a three-part version", () => {
        const version = Module.deserialize(saved({ version: "1.21.0" }), WHERE).version;
        assert.equal(version.build, 0);
        assert.equal(version.toString(), "1.21.0");
    });

    it("accepts an imported build", () => {
        assert.equal(Module.deserialize(saved({ imported: true }), WHERE).imported, true);
    });

    it("accepts the preview channel", () => {
        assert.equal(Module.deserialize(saved({ channel: "preview" }), WHERE).channel, "preview");
    });

    it("names the file and index in every rejection", () => {
        assert.throws(() => Module.deserialize(null, WHERE), /versions\.json\[0\]: /);
        assert.throws(() => Module.deserialize(saved({ uuid: "" }), WHERE), /versions\.json\[0\]: /);
    });

    it("rejects an entry that is not an object", () => {
        for (const raw of [null, undefined, "version", 7, true]) {
            assert.throws(() => Module.deserialize(raw, WHERE), /version is not an object/, `accepted ${String(raw)}`);
        }
    });

    // Unlike a profile, no string field here may be empty: every one of them is used to find,
    // launch or delete a build on disk.
    it("rejects an empty string in any text field", () => {
        for (const key of ["uuid", "label", "version", "path", "packageFamily"]) {
            rejects({ [key]: "" }, new RegExp(`"${key}" must be a non-empty string`));
        }
    });

    it("rejects a non-string in any text field", () => {
        for (const key of ["uuid", "label", "version", "path", "packageFamily"]) {
            rejects({ [key]: 3 }, new RegExp(`"${key}" must be a non-empty string`));
            rejects({ [key]: undefined }, new RegExp(`"${key}" must be a non-empty string`));
        }
    });

    it("rejects a channel that is not release or preview", () => {
        for (const channel of ["Release", "beta", "", null, undefined]) {
            rejects({ channel }, /"channel" must be "release" or "preview"/);
        }
    });

    it("rejects a truthy value that is not a boolean for imported", () => {
        for (const imported of ["true", 1, null, undefined, {}]) {
            rejects({ imported }, /"imported" must be a boolean/);
        }
    });

    it("rejects a version string no version parser accepts", () => {
        for (const version of ["1.21", "1.21.0.3.4", "v1.21.0", "1.21.0-beta", "latest"]) {
            rejects({ version }, /Invalid version string format/);
        }
    });

    it("blames the channel and the imported flag before any text field", () => {
        assert.throws(() => Module.deserialize({}, WHERE), /"channel" must be "release" or "preview"/);
        assert.throws(() => Module.deserialize({ channel: "release" }, WHERE), /"imported" must be a boolean/);
    });
});

describe("naming the folder a build is installed into", gate, () => {
    it("joins version, channel and uuid into one segment", () => {
        assert.equal(Module.artifactSlug("1.21.0.3", "release", UUID), `Minecraft-1.21.0.3-release-${UUID}`);
    });

    it("refuses anything that would escape the versions folder", () => {
        for (const version of ["../1.21.0.3", "1.21.0.3/..", "C:\\evil", "1.21.0.3\\x", "a/b"]) {
            assert.throws(
                () => Module.artifactSlug(version, "release", UUID),
                /cannot be used as a folder name/,
                version
            );
        }
    });

    it("refuses a segment that ends in a space or a dot", () => {
        assert.throws(() => Module.artifactSlug("1.21.0.3", "release", `${UUID} `), /cannot be used as a folder name/);
        assert.throws(() => Module.artifactSlug("1.21.0.3", "release", `${UUID}.`), /cannot be used as a folder name/);
    });

    it("quotes the rejected name so the log says which one it was", () => {
        assert.throws(() => Module.artifactSlug("../x", "release", UUID), /"Minecraft-\.\.\/x-release-/);
    });
});
