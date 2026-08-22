import { SemVersion } from "../classes/SemVersion.ts";
import { type Channel, isChannel } from "../domain/Channel.ts";

export interface InstalledVersion {
    uuid: string;
    label: string;
    channel: Channel;
    version: SemVersion;
    path: string;
    /** Appx family this build registers as, read from its manifest at install time. */
    packageFamily: string;
    imported: boolean;
}

/**
 * The one folder name shape the launcher creates under the versions folder. Anything else is
 * refused here, because the caller joins the result onto `versionsPath` and hands it to a
 * recursive delete.
 */
const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9 ._-]*[A-Za-z0-9_-]$/;

/** Version and channel alone are not unique across imports; the uuid is. */
export function artifactSlug(version: string, channel: Channel, uuid: string): string {
    const slug = `Minecraft-${version}-${channel}-${uuid}`;
    if (!SAFE_SEGMENT.test(slug)) {
        throw new Error(`"${slug}" cannot be used as a folder name: only letters, digits, spaces, ".", "_" and "-" are allowed.`);
    }
    return slug;
}

export function serialize(v: InstalledVersion): unknown {
    return {
        uuid: v.uuid,
        label: v.label,
        channel: v.channel,
        version: v.version.toString(),
        path: v.path,
        packageFamily: v.packageFamily,
        imported: v.imported,
    };
}

export function deserialize(raw: unknown, where: string): InstalledVersion {
    if (typeof raw !== "object" || raw === null) throw new Error(`${where}: version is not an object`);
    const o = raw as Record<string, unknown>;

    const text = (key: string): string => {
        const value = o[key];
        if (typeof value !== "string" || value === "") {
            throw new Error(`${where}: "${key}" must be a non-empty string`);
        }
        return value;
    };

    if (!isChannel(o.channel)) throw new Error(`${where}: "channel" must be "release" or "preview"`);
    if (typeof o.imported !== "boolean") throw new Error(`${where}: "imported" must be a boolean`);

    return {
        uuid: text("uuid"),
        label: text("label"),
        channel: o.channel,
        version: SemVersion.fromString(text("version")),
        path: text("path"),
        packageFamily: text("packageFamily"),
        imported: o.imported,
    };
}
