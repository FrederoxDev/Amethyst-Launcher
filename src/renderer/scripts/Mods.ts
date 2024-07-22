import { ModsFolder } from './Paths'

import Ajv, {JSONSchemaType, DefinedError} from 'ajv'
const ajv = new Ajv({allErrors: true})

//////////////////// MOD CONFIG ////////////////////

export interface ModConfig {
  meta: {
    name: string
    version: string
    author: string
    description?: string
    is_runtime?: boolean
  }
}

const ModConfigSchema: JSONSchemaType<ModConfig> = {
  type: 'object',
  properties: {
    meta: {
      type: 'object',
      properties: {
        name: { type: 'string', default: '' },
        version: { type: 'string', default: '' },
        author: { type: 'string', default: '' },
        description: { type: 'string', nullable: true },
        is_runtime: { type: 'boolean', nullable: true },
      },
      required: ['name', 'version', 'author']
    }
  },
  required: ['meta'],
  additionalProperties: false
}

const Validator = ajv.compile(ModConfigSchema);

export function ValidateMod(config: Record<string, unknown>, outErrors?: string[]): ModConfig {

  Validator(config)

  if (Validator.errors) {
    for (const err of Validator.errors as DefinedError[]) {
      switch (err.keyword) {
        case 'type':
          outErrors?.push(`Field '${err.instancePath}' must be of type '${err.params.type}'`)
      }
    }
  }

  return {
    meta: {
      name: '',
      version: '',
      author: ''
    },
    ...config
  }


  // const validated_config: ModConfig = {
  //   meta: {
  //     name: '',
  //     version: '',
  //     author: '',
  //     description: undefined,
  //     is_runtime: undefined
  //   }
  // }
  //
  // if ('meta' in config && typeof config['meta'] === 'object' && config['meta'] != null) {
  //   const meta = config['meta']
  //
  //   if ('name' in meta) {
  //     if (typeof meta['name'] !== 'string') {
  //       outErrors?.push(`field 'name' in 'meta' must be of type 'string'`)
  //     } else validated_config.meta.name = meta['name']
  //   } else outErrors?.push(`object 'meta' must contain field 'name' of type 'string'`)
  //
  //   if ('version' in meta) {
  //     if (typeof meta['version'] !== 'string') {
  //       outErrors?.push(`field 'version' in 'meta' must be of type 'string'`)
  //     } else validated_config.meta.version = meta['version']
  //   } else outErrors?.push(`object 'meta' must contain field 'version' of type 'string'`)
  //
  //   if ('author' in meta) {
  //     if (typeof meta['author'] !== 'string') {
  //       outErrors?.push(`field 'author' in 'meta' must be of type 'string'`)
  //     } else validated_config.meta.author = meta['author']
  //   } else outErrors?.push(`object 'meta' must contain field 'author' of type 'string'`)
  //
  //   if ('description' in meta) {
  //     if (typeof meta['description'] !== 'string') {
  //       outErrors?.push(`field 'description' in 'meta' must be of type 'string'`)
  //     } else validated_config.meta.description = meta['description']
  //   }
  //
  //   if ('is_runtime' in meta) {
  //     if (typeof meta['is_runtime'] !== 'boolean') {
  //       outErrors?.push(`field 'is_runtime' in 'meta' must be of type 'boolean'`)
  //     } else validated_config.meta.is_runtime = meta['is_runtime']
  //   }
  // } else outErrors?.push(`mod.json should have field 'meta' of type 'object'`)
  //
  // return validated_config
}

//////////////////// MOD LIST ////////////////////

import * as fs from 'fs'
import * as path from 'path'

export type ModList = {
  runtimeMods: string[]
  mods: string[]
}

export function GetMods(): ModList {
  if (fs.existsSync(ModsFolder)) {
    const mods: ModList = {
      mods: [],
      runtimeMods: []
    }

    const mod_directories = fs.readdirSync(ModsFolder, { withFileTypes: true }).filter(entry => entry.isDirectory())

    for (const mod_directory of mod_directories) {
      const dir_path = path.join(mod_directory.parentPath, mod_directory.name)

      const config_path = path.join(dir_path, 'mod.json')
      if (fs.existsSync(config_path)) {
        let mod_config: ModConfig

        const config_file = fs.readFileSync(config_path, 'utf-8')

        try {
          const parsed_config = JSON.parse(config_file)
          mod_config = ValidateMod(parsed_config)
        } catch {
          console.error(`Failed to read/parse the config for ${mod_directory.name} folder`)
          continue
        }

        if (mod_config.meta.is_runtime) {
          mods.runtimeMods.push(mod_directory.name)
        } else {
          mods.mods.push(mod_directory.name)
        }
      }
    }

    return mods
  } else {
    return {
      mods: [],
      runtimeMods: []
    }
  }
}
