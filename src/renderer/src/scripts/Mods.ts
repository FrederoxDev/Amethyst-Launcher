const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

import { describeError, userMessage } from "@shared/diagnostics/Log";
import { log } from "@renderer/scripts/LauncherLog";
import { useAppStore } from "@renderer/states/AppStore";
import type { LauncherPaths } from "@renderer/scripts/platform/LauncherPlatform";
import { describeSchemaErrors, MOD_FORMATS, ModConfig } from "./schema/ModConfigSchema";
import type { ModDependencyStatus, ModStatus } from "@renderer/scripts/domain/ProfileDiagnosis";

function getPaths(): LauncherPaths {
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

/**
 * Runtimes only.
 *
 * The contract that changed is the one between Amethyst-Preload and the runtime: the preload
 * calls `AmethystRuntimeStart`, where the dxgi proxy called `Init` with a suspended game thread.
 * Nothing a content mod implements takes part in that - a mod still exports `Initialize` and
 * still links the same AmethystAPI - so gating every mod on the format would have made a
 * launcher-wide break out of a change only runtimes can see.
 */
const RUNTIME_FORMAT_VERSION = "1.3.0";

const PLACEHOLDER_UUID = "00000000-0000-0000-0000-000000000000";

export function ValidateMod(id: string): ValidatedMod {
    const paths = getPaths();
    const modConfigPath = path.join(paths.modsPath, id, "mod.json");

    const errors: string[] = [];
    const warnings: string[] = [];
    const rejected = (): ValidatedMod => ({ ok: false, config: undefined, errors, warnings, id });

    let parsed: unknown;
    try {
        parsed = JSON.parse(fs.readFileSync(modConfigPath, "utf-8"));
    } catch (e) {
        log("Mods", `Could not read ${modConfigPath}: ${describeError(e)}`);
        errors.push(`${id}: could not read ${modConfigPath} - ${userMessage(e)}`);
        return rejected();
    }

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        errors.push(`${id}: mod.json does not hold a JSON object.`);
        return rejected();
    }

    const configUnchecked = parsed as Record<string, unknown>;
    const formatVersion = configUnchecked["format_version"];

    if (typeof formatVersion !== "string") {
        errors.push(
            `${id}: mod.json has no format_version field. Add one - the fallback to an assumed version is gone.`
        );
        return rejected();
    }

    const format = MOD_FORMATS.find(candidate => candidate.version === formatVersion);
    if (format === undefined) {
        errors.push(`${id}: mod.json declares an unknown format_version "${formatVersion}".`);
        return rejected();
    }

    if (format.support === "removed") {
        errors.push(
            `${id} is built for Amethyst format_version "${formatVersion}", which this launcher can no longer run. `
            + "Check for an update from its author, or remove it from the profile."
        );
        return rejected();
    }

    if (format.support === "deprecated") {
        warnings.push(
            `Mod uses deprecated format_version "${formatVersion}". New mods should update to a newer format_version.`
        );
    }

    const outcome = format.validate(configUnchecked);
    if (!outcome.ok) {
        errors.push(...describeSchemaErrors(id, outcome.errors));
        return rejected();
    }

    const config = outcome.config;

    // Only knowable once the config is converted: whether a mod is a runtime is a field
    // inside it, not something the format version says.
    if (config.meta.type === "runtime" && formatVersion !== RUNTIME_FORMAT_VERSION) {
        errors.push(
            `This runtime is built for Amethyst format_version "${formatVersion}", and runtimes must be on `
            + `"${RUNTIME_FORMAT_VERSION}" to start the game. Update the runtime, or pick a newer one. `
            + "Your other mods are unaffected."
        );
        return rejected();
    }

    if (config.meta.uuid === PLACEHOLDER_UUID) {
        warnings.push(
            `Mod is using the placeholder UUID "${PLACEHOLDER_UUID}", please generate a unique UUID for your mod`
        );
    }

    return { ok: true, config, warnings, errors, id };
}

function toDependencyStatus(config: ModConfig): ModDependencyStatus[] {
    return (config.meta.dependencies ?? []).map(dependency => ({
        uuid: dependency.dependency_uuid ?? "",
        namespace: dependency.dependency_namespace ?? "",
        versionRange: dependency.version_range,
        isSoft: dependency.is_soft ?? false,
    }));
}

/** The scan's result in the shape a profile diagnosis reads, so both sides cannot drift apart. */
export function toModStatus(mods: readonly ValidatedMod[]): ModStatus[] {
    return mods.map(mod => ({
        id: mod.id,
        ok: mod.ok,
        isRuntime: mod.ok && mod.config.meta.type === "runtime",
        errors: mod.errors,
        uuid: mod.ok ? mod.config.meta.uuid : undefined,
        namespace: mod.ok ? mod.config.meta.namespace : undefined,
        version: mod.ok ? mod.config.meta.version : undefined,
        dependencies: mod.ok ? toDependencyStatus(mod.config) : [],
    }));
}
