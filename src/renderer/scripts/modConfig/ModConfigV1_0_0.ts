import Ajv from "ajv";
import { IntermediateModConfig } from "./IntermediateModConfig";
export const ajv = new Ajv();

export interface ModConfigV1 {
    format_version: "1.0.0",
    meta: {
        is_runtime?: boolean,
        author?: string,
        name: string,
        version: string
    }
}

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

export const FromValidatedV1ToConfig = (validated: ModConfigV1): IntermediateModConfig => {
    let authors: string[] = [];
    if (validated.meta.author) 
        authors = [validated.meta.author]

    return {
        format_version: validated.format_version,
        meta: {
            name: validated.meta.name,
            version: validated.meta.version,
            type: validated.meta.is_runtime ? "runtime" : "mod",
            authors: authors,
            dependencies: [] // 1.0.0 has no dependencies.
        }
    }
}