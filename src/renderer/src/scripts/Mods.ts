const fs = window.require("fs");
const path = window.require("path");

import { describeError } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import {
    ajv,
    FromValidatedV1_1_0ToConfig,
    FromValidatedV1_2_0ToConfig,
    ModConfig,
    ValidateModSchemaV1_1_0,
    ValidateModSchemaV1_2_0,
} from "./schema/ModConfigSchema";
import type { ValidateFunction } from "ajv";

function getPaths() {
    return useAppStore.getState().platform.getPaths();
}

/**
 * The mods folder is re-scanned by a filesystem watcher, so the scan itself must stay quiet.
 * Only a scan whose outcome differs from the last one is worth a line.
 */
let lastScanSignature: string | null = null;

function scanSignature(mods: ValidatedMod[]): string {
    return mods.map(m => `${m.id}:${m.ok ? "ok" : m.errors.join("|")}:${m.warnings.join("|")}`).join("\n");
}

function describeScan(mods: ValidatedMod[]): string {
    if (mods.length === 0) return "no mod folders";
    return mods
        .map(m => {
            if (!m.ok) return `${m.id} INVALID (${m.errors.join("; ")})`;
            const warnings = m.warnings.length > 0 ? ` warnings: ${m.warnings.join("; ")}` : "";
            return `${m.id} ok (${m.config.meta.type})${warnings}`;
        })
        .join(", ");
}

export function GetAllMods(): ValidatedMod[] {
    const paths = getPaths();
    if (!fs.existsSync(paths.modsPath)) {
        if (lastScanSignature !== "missing") {
            lastScanSignature = "missing";
            log("Mods", `No mods folder at ${paths.modsPath}, reporting zero mods`);
        }
        return [];
    }

    const allFolders = fs
        .readdirSync(paths.modsPath, { withFileTypes: true })
        .filter(f => f.isDirectory())
        .map(dir => dir.name);

    const result: ValidatedMod[] = [];

    allFolders.forEach(modIdentifier => {
        const validated = ValidateMod(modIdentifier);
        result.push(validated);
    });

    const signature = scanSignature(result);
    if (signature !== lastScanSignature) {
        lastScanSignature = signature;
        log("Mods", `Scanned ${paths.modsPath}: ${describeScan(result)}`);
    }

    return result;
}

export type ValidatedMod =
    | { ok: true; config: ModConfig; errors: string[]; warnings: string[]; id: string }
    | { ok: false; config: undefined; errors: string[]; warnings: string[]; id: string };

export enum DeprecatedStatus {
    None,
    Deprecated,
    Removed,
}

const validators: { [version: string]: [ValidateFunction, (data: any) => ModConfig | undefined, DeprecatedStatus] } = {
    "1.1.0": [ValidateModSchemaV1_1_0, FromValidatedV1_1_0ToConfig, DeprecatedStatus.None],
    "1.2.0": [ValidateModSchemaV1_2_0, FromValidatedV1_2_0ToConfig, DeprecatedStatus.None],
};

const deprecatedVersions = ["1.0.0"];

export function ValidateMod(id: string): ValidatedMod {
    const paths = getPaths();
    const modConfigPath = path.join(paths.modsPath, id, "mod.json");
    let configUnchecked: Record<any, any> = {};

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
        const configDataText = fs.readFileSync(modConfigPath, "utf-8");
        configUnchecked = JSON.parse(configDataText);
    } catch (e) {
        log("Mods", `Could not read ${modConfigPath}: ${describeError(e)}`);
        errors.push(`Failed to read/parse ${modConfigPath}`);

        return {
            ok: false,
            errors,
            warnings,
            config: undefined,
            id,
        };
    }

    // if format_version field is not present, inject the 1.0.0 format_version
    // this is needed for old mods to still be able to correctly validate :)
    if (configUnchecked["format_version"] === undefined) {
        configUnchecked["format_version"] = "1.1.0";
        errors.push(
            "No format_version field present, please add a format_version field to your mod.json! Fallback is no longer supported."
        );

        return {
            ok: false,
            config: undefined,
            warnings,
            errors,
            id,
        };
    }

    if (deprecatedVersions.includes(configUnchecked["format_version"])) {
        errors.push(`Mod uses deprecated format_version "${configUnchecked["format_version"]}"`);

        return {
            ok: false,
            config: undefined,
            warnings,
            errors,
            id,
        };
    }

    for (const [version, [validator, fromValidated, deprecationStatus]] of Object.entries(validators)) {
        if (configUnchecked["format_version"] !== version) continue;

        if (deprecationStatus === DeprecatedStatus.Deprecated) {
            warnings.push(
                `Mod uses deprecated format_version "${version}". New mods should update to a newer format_version.`
            );
        }

        const success = validator(configUnchecked);
        if (!success) {
            errors.push(...ajv.errorsText(validator.errors, { dataVar: "mod.config/", separator: "\n" }).split("\n"));

            return {
                ok: false,
                config: undefined,
                warnings,
                errors,
                id,
            };
        }

        const config = fromValidated(configUnchecked);
        if (!config) {
            errors.push("Failed to convert validated config to internal representation for format_version " + version);

            return {
                ok: false,
                config: undefined,
                warnings,
                errors,
                id,
            };
        }

        // Check for common mod.json issues
        if (config.meta.uuid === "00000000-0000-0000-0000-000000000000") {
            warnings.push(
                'Mod is using the placeholder UUID "00000000-0000-0000-0000-000000000000", please generate a unique UUID for your mod'
            );
        }

        return {
            ok: true,
            config,
            warnings,
            errors: errors,
            id,
        };
    }

    errors.push(`Unknown format_version "${configUnchecked["format_version"]}"`);

    return {
        ok: false,
        config: undefined,
        warnings,
        errors,
        id,
    };
}
