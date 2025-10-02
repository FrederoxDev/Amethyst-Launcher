import * as fs from 'fs'
import * as path from 'path'
import { FromValidatedV1_1_0ToConfig, ModConfig, ValidateModSchemaV1_1_0, ajv } from './schema/ModConfigSchema'
import { ModsFolder } from './Paths'
import type { ValidateFunction } from 'ajv'


export function GetAllMods(): ValidatedMod[] {
  if (!fs.existsSync(ModsFolder)) return []

  const allFolders = fs
    .readdirSync(ModsFolder, { withFileTypes: true })
    .filter(f => f.isDirectory())
    .map(dir => dir.name)

  const result: ValidatedMod[] = []

  allFolders.forEach(modIdentifier => {
    const validated = ValidateMod(modIdentifier)
    result.push(validated)
  })

  return result
}

export type ValidatedMod =
  | { ok: true; config: ModConfig; errors: string[]; warnings: string[], id: string }
  | { ok: false; config: undefined; errors: string[]; warnings: string[], id: string }

const validators: {[version: string]: [ValidateFunction, (data: any) => ModConfig | undefined]} = {
  // '1.0.0': [ValidateModSchemaV1, FromValidatedV1ToConfig],
  '1.1.0': [ValidateModSchemaV1_1_0, FromValidatedV1_1_0ToConfig]
}

const deprecatedVersions = ['1.0.0']

export function ValidateMod(id: string): ValidatedMod {
  const modConfigPath = path.join(ModsFolder, id, 'mod.json')
  let configUnchecked: Record<any, any> = {}

  const errors: string[] = [];
  const warnings: string[] = [];

  try {
    const configDataText = fs.readFileSync(modConfigPath, 'utf-8')
    configUnchecked = JSON.parse(configDataText)
  } catch (e) {
    errors.push('Failed to read/parse config.json')

    return {
      ok: false,
      errors,
      warnings,
      config: undefined,
      id
    }
  }

  // if format_version field is not present, inject the 1.0.0 format_version
  // this is needed for old mods to still be able to correctly validate :)
  if (configUnchecked['format_version'] === undefined) {
    configUnchecked['format_version'] = '1.1.0'
    warnings.push('No format_version field present, falling back to "1.1.0", please add a format_version field to your mod.json')
  }

  if (deprecatedVersions.includes(configUnchecked['format_version'])) {
    errors.push(`Mod uses deprecated format_version "${configUnchecked['format_version']}"`);

    return {
      ok: false,
      config: undefined,
      warnings,
      errors,
      id
    }
  }

  for (const [version, [validator, fromValidated]] of Object.entries(validators)) {
    console.log(version, configUnchecked['format_version'])
    if (configUnchecked['format_version'] !== version) continue;

    const success = validator(configUnchecked)
    if (!success) {
      errors.push(...ajv.errorsText(validator.errors, { dataVar: 'mod.config/', separator: '\n' }).split('\n'));

      return {
        ok: false,
        config: undefined,
        warnings,
        errors,
        id
      }
    }

    const config = fromValidated(configUnchecked)
    if (!config) {
      errors.push('Failed to convert validated config to internal representation for format_version ' + version);

      return {
        ok: false,
        config: undefined,
        warnings,
        errors,
        id
      }
    }

    // Check for common mod.json issues
    if (config.meta.uuid === '00000000-0000-0000-0000-000000000000') {
      warnings.push('Mod is using the placeholder UUID "00000000-0000-0000-0000-000000000000", please generate a unique UUID for your mod');
    }

    return {
      ok: true,
      config,
      warnings,
      errors: errors,
      id
    }
  }

  errors.push(`Unknown format_version "${configUnchecked['format_version']}"`)

  return {
    ok: false,
    config: undefined,
    warnings,
    errors,
    id
  }
}
