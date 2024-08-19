import Ajv from "ajv";
export const ajv = new Ajv();

const ModConfigSchemaV1 = {
    type: "object",
    properties: {
        format_version: { type: "string", const: "1.0.0" },
        meta: {
            type: "object",
            properties: {
                is_runtime: {
                    type: "boolean"
                },
                name: {
                    type: "string"
                },
                version: {
                    type: "string"
                },
                author: {
                    type: "string"
                }
            },
            required: ["name", "version"]
        }
    },
    required: ["format_version", "meta"]
};

export const ValidateModSchemaV1 = ajv.compile(ModConfigSchemaV1);