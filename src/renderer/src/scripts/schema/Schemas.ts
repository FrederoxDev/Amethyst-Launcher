export const ModConfigSchemaV1_1_0 = {
    type: "object",
    properties: {
        format_version: { type: "string", const: "1.1.0" },
        meta: {
            type: "object",
            properties: {
                name: { type: "string" },
                uuid: { type: "string" },
                version: { type: "string" },
                namespace: { type: "string" },

                is_runtime: { type: "boolean" },
                author: { type: "string" },
                friendly_name: { type: "string" },
                log_name: { type: "string" },

                dependencies: {
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
                },
            },
            required: ["name", "uuid", "version", "namespace"],
            additionalProperties: false,
        },
    },
    required: ["format_version", "meta"],
    additionalProperties: false,
};

/**
 * Structurally 1.2.0. The bump exists to gate on the runtime contract rather than the file:
 * mods built against the old proxy were handed a suspended game thread and a runtime that
 * loaded after the game had started, and nothing in a mod.json distinguishes one of those from
 * a mod built against the preload. The format version is the only thing that can.
 */
export const ModConfigSchemaV1_3_0 = {
    type: "object",
    properties: {
        format_version: { type: "string", const: "1.3.0" },
        meta: {
            type: "object",
            properties: {
                name: { type: "string" },
                uuid: { type: "string" },
                version: { type: "string" },
                namespace: { type: "string" },

                is_runtime: { type: "boolean" },
                author: { type: "string" },
                friendly_name: { type: "string" },
                log_name: { type: "string" },

                dependencies: {
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
                },

                platforms: {
                    type: "object",
                    properties: {
                        "win-client": { type: "object" },
                        "win-server": { type: "object" },
                    },
                    additionalProperties: false,
                },
            },
            required: ["name", "uuid", "version", "namespace", "platforms"],
            additionalProperties: false,
        },
    },
    required: ["format_version", "meta"],
    additionalProperties: false,
};

export const ModConfigSchemaV1_2_0 = {
    type: "object",
    properties: {
        format_version: { type: "string", const: "1.2.0" },
        meta: {
            type: "object",
            properties: {
                name: { type: "string" },
                uuid: { type: "string" },
                version: { type: "string" },
                namespace: { type: "string" },

                is_runtime: { type: "boolean" },
                author: { type: "string" },
                friendly_name: { type: "string" },
                log_name: { type: "string" },

                dependencies: {
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
                },

                platforms: {
                    type: "object",
                    properties: {
                        "win-client": { type: "object" },
                        "win-server": { type: "object" },
                    },
                    additionalProperties: false,
                },
            },
            required: ["name", "uuid", "version", "namespace", "platforms"],
            additionalProperties: false,
        },
    },
    required: ["format_version", "meta"],
    additionalProperties: false,
};
