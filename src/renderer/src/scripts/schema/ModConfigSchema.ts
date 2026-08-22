import Ajv from "ajv";
import type { ErrorObject } from "ajv";

import { ModConfigSchemaV1_1_0, ModConfigSchemaV1_2_0, ModConfigSchemaV1_3_0 } from "@renderer/scripts/schema/Schemas";

/** `allErrors` because every surface that shows a rejected mod is built to list more than one. */
const ajv = new Ajv({ allErrors: true });

export interface ModDependency {
    dependency_uuid: string;
    dependency_namespace?: string;
    version_range: string;
    /** Read by the runtime; a soft dependency does not have to be present. */
    is_soft?: boolean;
}

interface ModPlatform {}

type SupportedPlatform = "win-client" | "win-server";

/**
 * The intermediate format of ModConfig that is independant of the schema format version.
 */
export interface ModConfig {
    format_version: string;
    meta: {
        name: string;
        version: string;

        type: "runtime" | "mod";
        authors: string[];

        namespace: string;
        uuid: string;
        dependencies?: ModDependency[];

        platforms: Partial<Record<SupportedPlatform, ModPlatform>>;
    };
}

/** What every mod.json schema validates to. Only `platforms` differs between the versions. */
interface ValidatedModConfig {
    format_version: string;
    meta: {
        name: string;
        uuid: string;
        version: string;
        namespace: string;
        is_runtime?: boolean;
        author?: string | string[];
        friendly_name?: string;
        log_name?: string;
        dependencies?: ModDependency[];
        platforms?: Partial<Record<SupportedPlatform, ModPlatform>>;
    };
}

function toAuthors(author: string | string[] | undefined): string[] {
    if (author === undefined) return [];
    return typeof author === "string" ? [author] : author;
}

function toModConfig(validated: ValidatedModConfig): ModConfig {
    return {
        format_version: validated.format_version,
        meta: {
            name: validated.meta.name,
            version: validated.meta.version,
            type: validated.meta.is_runtime ? "runtime" : "mod",
            authors: toAuthors(validated.meta.author),
            namespace: validated.meta.namespace,
            uuid: validated.meta.uuid,
            dependencies: validated.meta.dependencies,
            // 1.1.0 predates the field, and the only platform it ever ran on is win-client.
            platforms: validated.meta.platforms ?? { "win-client": {} },
        },
    };
}

export type SchemaOutcome = { ok: true; config: ModConfig } | { ok: false; errors: ErrorObject[] };

export type ModFormat =
    | { version: string; support: "removed" }
    | { version: string; support: "current" | "deprecated"; validate: (data: unknown) => SchemaOutcome };

function modFormat(version: string, schema: object, support: "current" | "deprecated"): ModFormat {
    const validate = ajv.compile(schema);

    return {
        version,
        support,
        validate: data => {
            // The one place the schema and `ValidatedModConfig` are asserted to agree, rather than
            // once per format with the interface out of reach.
            if (validate(data)) return { ok: true, config: toModConfig(data as ValidatedModConfig) };
            return { ok: false, errors: validate.errors ?? [] };
        },
    };
}

/** The one place a format_version is recognised, whether it is still runnable or not. */
export const MOD_FORMATS: readonly ModFormat[] = [
    { version: "1.0.0", support: "removed" },
    modFormat("1.1.0", ModConfigSchemaV1_1_0, "deprecated"),
    modFormat("1.2.0", ModConfigSchemaV1_2_0, "deprecated"),
    modFormat("1.3.0", ModConfigSchemaV1_3_0, "current"),
];

/** Ajv's own words, with the mod and the field named so the user knows where to look. */
export function describeSchemaErrors(modId: string, errors: readonly ErrorObject[]): string[] {
    return errors.map(error => {
        const path = error.instancePath.replace(/^\//, "").replace(/\//g, ".");
        const field = path === "" ? "mod.json" : `mod.json ${path}`;
        return `${modId}: ${field} ${error.message ?? "is not valid"}`;
    });
}
