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

        dependencies: {
          type: "array",
          items: {
            type: "object",
            properties: {
              dependency_uuid: { type: "string" },
              dependency_namespace: { type: "string" },
              version_range: { type: "string" }
            },
            required: ["dependency_uuid", "version_range"],
            additionalProperties: false
          }
        }
      },
      required: ["name", "uuid", "version", "namespace"],
      additionalProperties: false
    }
  },
  required: ["format_version", "meta"],
  additionalProperties: false
}