import Ajv from "ajv";
import { IntermediateModConfig } from "./IntermediateModConfig";
export const ajv = new Ajv();

export interface ModConfigV1_0_0 {
    format_version: "1.0.0",
    meta: {
        is_runtime?: boolean,
        author?: string,
        name: string,
        version: string
    }
}

const ModConfigSchemaV1_0_0 = {
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

export const ValidateModSchemaV1_0_0 = ajv.compile(ModConfigSchemaV1_0_0);

export const FromValidatedV1_0_0ToConfig = (validated: ModConfigV1_0_0): IntermediateModConfig => {
    let authors: string[] = [];
    if (validated.meta.author) 
        authors = [validated.meta.author]

    return {
        format_version: validated.format_version,
        meta: {
            name: validated.meta.name,
            version: validated.meta.version,
            type: validated.meta.is_runtime ? "runtime" : "mod", // 1.0.0 uses a "is_runtime" boolean flag, convert to new
            authors: authors,
            dependencies: [] // 1.0.0 has no dependencies.
        }
    }
}