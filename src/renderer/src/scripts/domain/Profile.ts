import { Channel, isChannel } from "./Channel";

export interface Profile {
    uuid: string;
    name: string;
    channel: Channel;
    /** The only version identity. Empty means no version chosen yet. */
    versionUuid: string;
    /** Display text only — never used to resolve a version. */
    versionLabel: string;
    runtime: string;
    mods: string[];
}

export function isModded(profile: Profile): boolean {
    return profile.mods.length > 0 || profile.runtime.toLowerCase() !== "vanilla";
}

export function parseProfile(raw: unknown, where: string): Profile {
    if (typeof raw !== "object" || raw === null) throw new Error(`${where}: profile is not an object`);
    const o = raw as Record<string, unknown>;

    const text = (key: string, allowEmpty = false): string => {
        const value = o[key];
        if (typeof value !== "string") throw new Error(`${where}: "${key}" must be a string`);
        if (!allowEmpty && value === "") throw new Error(`${where}: "${key}" must not be empty`);
        return value;
    };

    if (!isChannel(o.channel)) throw new Error(`${where}: "channel" must be "release" or "preview"`);
    if (!Array.isArray(o.mods) || !o.mods.every(m => typeof m === "string")) {
        throw new Error(`${where}: "mods" must be an array of strings`);
    }

    return {
        uuid: text("uuid"),
        name: text("name"),
        channel: o.channel,
        versionUuid: text("versionUuid", true),
        versionLabel: text("versionLabel", true),
        runtime: text("runtime"),
        mods: o.mods as string[],
    };
}
