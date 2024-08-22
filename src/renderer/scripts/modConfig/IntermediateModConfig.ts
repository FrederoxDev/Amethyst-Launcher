/**
 * The intermediate format of ModConfig that is independant of the schema format version.
 */
export interface IntermediateModConfig {
    format_version: string,
    meta: {
        name: string,
        version: string,
        type: "runtime" | "mod",
        authors: string[],
        dependencies: string[]
    }
}