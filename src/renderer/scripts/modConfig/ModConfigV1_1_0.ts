import Ajv from "ajv";
import { IntermediateModConfig, ModType } from "./IntermediateModConfig";
export const ajv = new Ajv();

export interface ModConfigV1_1_0 {
    format_version: "1.1.0",
    meta: {
        name: string,
        version: string,
        format: ModType,
        author?: string | string[],
        description?: string
    },
    dependencies?: string[]
}

const ModConfigSchemaV1_1_0 = {
    type: "object",
    properties: {
        format_version: { type: "string", const: "1.1.0" },
        meta: {
            type: "object",
            properties: {
                name: { type: "string" },
                version: { type: "string" },
                format: { type: "string", enum: ["runtime", "mod"] },
                author: {
                    oneOf: [
                        { type: "string" },
                        { type: "array", items: { type: "string" } }
                    ]
                },
                description: { type: "string" }
            },
            required: ["name", "version", "format"],
            additionalProperties: false,
        },
        dependencies: {
            type: "array",
            items: { type: "string" }
        }
    },
    required: ["format_version", "meta"],
    additionalProperties: false,
};

export const ValidateModSchemaV1_1_0 = ajv.compile(ModConfigSchemaV1_1_0);

export const FromValidatedV1_1_0ToConfig = (validated: ModConfigV1_1_0): IntermediateModConfig => {
    let authors: string[] = [];

    if (typeof validated.meta.author === "string") {
        authors = [validated.meta.author]
    }
    else if (Array.isArray(validated.meta.author)) {
        authors = validated.meta.author;
    }

    return {
        format_version: validated.format_version,
        meta: {
            name: validated.meta.name,
            version: validated.meta.version,
            type: validated.meta.format,
            authors: authors,
            dependencies: validated.dependencies || [] 
        }
    }
}