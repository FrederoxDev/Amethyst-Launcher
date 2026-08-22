/** The runtime (`ModInfo::FromFile`) takes either form, so a two-author mod must pass here too. */
const authorSchema = {
    anyOf: [{ type: "string" }, { type: "array", items: { type: "string" } }],
};

const dependenciesSchema = {
    type: "array",
    items: {
        type: "object",
        properties: {
            dependency_uuid: { type: "string" },
            dependency_namespace: { type: "string" },
            version_range: { type: "string" },
            // Read by the runtime (ModInfo::FromFile). Absent here, every mod
            // that declares a soft dependency is rejected by the launcher and
            // accepted by the runtime, which is the worse half of disagreeing.
            is_soft: { type: "boolean" },
        },
        required: ["dependency_uuid", "version_range"],
        additionalProperties: false,
    },
};

const platformsSchema = {
    type: "object",
    properties: {
        "win-client": { type: "object" },
        "win-server": { type: "object" },
    },
    additionalProperties: false,
};

/**
 * Every mod.json format differs only in its version string and whether `platforms` exists, so one
 * shape describes all of them.
 *
 * 1.2.0 and 1.3.0 are structurally the same. That bump gates on the runtime contract rather than
 * on the file: mods built against the old proxy were handed a suspended game thread and a runtime
 * that loaded after the game had started, and nothing inside a mod.json tells one of those from a
 * mod built against the preload. The format version is the only thing that can.
 */
function modConfigSchema(formatVersion: string, options: { platforms: boolean }): object {
    const required = ["name", "uuid", "version", "namespace"];

    return {
        type: "object",
        properties: {
            format_version: { type: "string", const: formatVersion },
            meta: {
                type: "object",
                properties: {
                    name: { type: "string" },
                    uuid: { type: "string" },
                    version: { type: "string" },
                    namespace: { type: "string" },

                    is_runtime: { type: "boolean" },
                    author: authorSchema,
                    friendly_name: { type: "string" },
                    log_name: { type: "string" },

                    dependencies: dependenciesSchema,
                    ...(options.platforms ? { platforms: platformsSchema } : {}),
                },
                required: options.platforms ? [...required, "platforms"] : required,
                additionalProperties: false,
            },
        },
        required: ["format_version", "meta"],
        additionalProperties: false,
    };
}

export const ModConfigSchemaV1_1_0 = modConfigSchema("1.1.0", { platforms: false });
export const ModConfigSchemaV1_2_0 = modConfigSchema("1.2.0", { platforms: true });
export const ModConfigSchemaV1_3_0 = modConfigSchema("1.3.0", { platforms: true });
