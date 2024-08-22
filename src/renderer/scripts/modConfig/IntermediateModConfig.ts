export type ModType = "runtime" | "mod";

/**
 * The intermediate format of ModConfig that is independant of the schema format version.
 */
export interface IntermediateModConfig {
    format_version: string,
    meta: {
        /**
         * Mod name with the version stripped out of it
         */
        name: string,

        /**
         * The actual mod's version in the SemVersion format
         */
        version: string,

        /**
         * The type of mod: for example "runtime" or "mod" currently
         */
        type: ModType,

        /**
         * An array of all of the authors of this mod
         */
        authors: string[],

        /**
         * An array of mod identifiers that are suggested dependencies of this mod
         * E.g. ["AmethystRuntime@1.0.0", "LibraryMod@1.3.0"]
         */
        dependencies: string[]
    }
}