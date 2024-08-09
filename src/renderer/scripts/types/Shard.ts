import { FolderPaths } from '../Paths'
import * as fs from 'node:fs'
import path from 'path'
import { Console } from './Console'
import { JSONSchemaType } from 'ajv'
import { SemVersion } from './SemVersion'
import AJV_Instance from '../schemas/AJV_Instance'

export namespace Shard {
  // region Shard.Format
  export enum Format {
    Mod = 0,
    Runtime = 1
  }

  export namespace Format {
    export const Schema: JSONSchemaType<Format> = {
      type: 'number',
      enum: [0, 1]
    }
    export const Validator = AJV_Instance.compile<Format>(Schema)
  }
  // endregion

  // region Shard.Option
  export type Option = Option.Text | Option.Toggle | Option.Radial | Option.Slider

  export namespace Option {
    // region Shard.Option.Value
    export type Value = string | boolean | number

    export namespace Value {
      export const Schema: JSONSchemaType<Value> = {
        oneOf: [{ type: 'string' }, { type: 'boolean' }, { type: 'number' }]
      }

      export const Validator = AJV_Instance.compile<Value>(Schema)
    }
    // endregion

    // region Shard.Option.Text
    export interface Text {
      type: 'text'
      properties: {
        label: string
        description?: string
        default_value: string
      }
    }

    export namespace Text {
      export const Schema: JSONSchemaType<Text> = {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'text' },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string', nullable: true },
              default_value: { type: 'string' }
            },
            required: ['label', 'default_value']
          }
        },
        required: ['type', 'properties']
      }

      export const Validator = AJV_Instance.compile<Text>(Schema)
    }
    // endregion

    // region Shard.Option.Toggle
    export interface Toggle {
      type: 'toggle'
      properties: {
        label: string
        description?: string
        default_value: boolean
      }
    }

    export namespace Toggle {
      export const Schema: JSONSchemaType<Toggle> = {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'toggle' },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string', nullable: true },
              default_value: { type: 'boolean' }
            },
            required: ['label', 'default_value']
          }
        },
        required: ['type', 'properties']
      }

      export const Validator = AJV_Instance.compile<Toggle>(Schema)
    }
    // endregion

    // region Shard.Option.Radial
    export interface Radial {
      type: 'radial'
      properties: {
        label: string
        description?: string
        options: string[]
        default_value: number
      }
    }

    export namespace Radial {
      export const Schema: JSONSchemaType<Radial> = {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'radial' },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string', nullable: true },
              options: {
                type: 'array',
                items: { type: 'string' }
              },
              default_value: { type: 'number' }
            },
            required: ['label', 'options', 'default_value']
          }
        },
        required: ['type', 'properties']
      }

      export const Validator = AJV_Instance.compile<Radial>(Schema)
    }
    // endregion

    // region Shard.Option.Slider
    export interface Slider {
      type: 'slider'
      properties: {
        label: string
        description?: string
        min: number
        max: number
        default_value: number
      }
    }

    export namespace Slider {
      export const Schema: JSONSchemaType<Slider> = {
        type: 'object',
        properties: {
          type: { type: 'string', const: 'slider' },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string' },
              description: { type: 'string', nullable: true },
              min: { type: 'number' },
              max: { type: 'number' },
              default_value: { type: 'number' }
            },
            required: ['label', 'min', 'max', 'default_value']
          }
        },
        required: ['type', 'properties']
      }

      export const Validator = AJV_Instance.compile<Slider>(Schema)
    }
    // endregion

    export const Schema: JSONSchemaType<Option> = {
      oneOf: [Text.Schema, Toggle.Schema, Radial.Schema, Slider.Schema]
    }

    export const Validator = AJV_Instance.compile<Option>(Schema)
  }
  // endregion

  // region Shard.Reference
  /**
   * Contains minimal data. Mainly used **internally**
   *
   * ```ts
   * name: string
   * uuid: string // Must be UUID v4
   * version: SemVersion.Primitive
   * ```
   *
   * @internal
   * @see {SemVersion.Primitive}
   */
  export interface Reference {
    name: string
    uuid: string
    version: SemVersion.Primitive
  }

  export namespace Reference {
    export const Schema: JSONSchemaType<Reference> = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        uuid: { type: 'string', format: 'uuid' },
        version: SemVersion.Primitive.Schema
      },
      required: ['name', 'uuid', 'version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Reference>(Schema)
  }
  // endregion

  // region Shard.Manifest
  /**
   * Contains full data. Mainly used **externally**
   *
   * ```ts
   * meta: {
   *  name: string
   *  author: string | string[]
   *  description?: string
   *  uuid: string // Must be UUID v4
   *  version: SemVersion.Primitive
   *  format?: Shard.Format
   * }
   * format_version: SemVersion.Primitive
   * dependencies?: Shard.Fragment[]
   * options?: Shard.Option[]
   * ```
   *
   * @external
   * @see {Shard.Format}
   * @see {Shard.Reference}
   * @see {Shard.Option}
   * @see {SemVersion.Primitive}
   */
  export interface Manifest {
    meta: {
      name: string
      author: string | string[]
      description?: string
      uuid: string
      version: SemVersion.Primitive
      format?: Shard.Format
    }
    format_version: SemVersion.Primitive
    dependencies?: Shard.Reference[]
    options?: Shard.Option[]
  }

  export namespace Manifest {
    export function toReference(shard: Shard.Manifest): Shard.Reference {
      return { name: shard.meta.name, uuid: shard.meta.uuid, version: shard.meta.version }
    }

    export const Schema: JSONSchemaType<Manifest> = {
      type: 'object',
      properties: {
        meta: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            author: {
              oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
            },
            description: { type: 'string', nullable: true },
            uuid: { type: 'string', format: 'uuid' },
            version: SemVersion.Primitive.Schema,
            format: { ...Shard.Format.Schema, nullable: true }
          },
          required: ['name', 'author', 'uuid', 'version'],
          additionalProperties: false
        },
        format_version: SemVersion.Primitive.Schema,
        dependencies: {
          type: 'array',
          items: Shard.Reference.Schema,
          nullable: true
        },
        options: {
          type: 'array',
          items: Shard.Option.Schema,
          nullable: true
        }
      },
      required: ['meta', 'format_version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Manifest>(Schema)
  }
  // endregion

  // region Shard.Extra
  export interface Extra {
    path: string
    manifest_path: string
    icon_path?: string
    manifest: Shard.Manifest
  }

  export namespace Extra {
    export function toReference(shard: Shard.Extra): Shard.Reference {
      return Shard.Manifest.toReference(shard.manifest)
    }

    export const Schema: JSONSchemaType<Extra> = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        manifest_path: { type: 'string' },
        icon_path: { type: 'string', nullable: true },
        manifest: Manifest.Schema
      },
      required: ['path', 'manifest_path', 'manifest']
    }

    export const Validator = AJV_Instance.compile<Extra>(Schema)
  }
  // endregion
}

export default Shard

export function GetShards(): Shard.Manifest[] {
  const shards: Shard.Manifest[] = []

  if (fs.existsSync(FolderPaths.Mods)) {
    const mod_directories = fs
      .readdirSync(FolderPaths.Mods, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
    for (const mod_directory of mod_directories) {
      const dir_path = path.join(mod_directory.parentPath, mod_directory.name)

      const config_path = path.join(dir_path, 'manifest.json')
      if (fs.existsSync(config_path)) {
        const text = fs.readFileSync(config_path, 'utf-8')
        const json = JSON.parse(text)

        if (Shard.Manifest.Validator(json)) {
          shards.push(json)
        } else {
          Console.Group(Console.ErrorStr(`Failed to parse "manifest.json" in ${mod_directory.name}`), () => {
            console.log(AJV_Instance.errorsText(Shard.Manifest.Validator.errors, { separator: '\n' }))
          })
        }
      }
    }
  }

  return shards
}

export function GetExtraShards(): Shard.Extra[] {
  const shards: Shard.Extra[] = []

  if (fs.existsSync(FolderPaths.Mods)) {
    const mod_directories = fs
      .readdirSync(FolderPaths.Mods, { withFileTypes: true })
      .filter(entry => entry.isDirectory())
    for (const mod_directory of mod_directories) {
      const dir_path = path.join(mod_directory.parentPath, mod_directory.name)

      const config_path = path.join(dir_path, 'manifest.json')
      if (fs.existsSync(config_path)) {
        const text = fs.readFileSync(config_path, 'utf-8')
        const json = JSON.parse(text)

        const icon_path = path.join(dir_path, 'icon.png')
        const icon_exists = fs.existsSync(icon_path)

        if (Shard.Manifest.Validator(json)) {
          shards.push({
            path: dir_path,
            manifest_path: config_path,
            icon_path: icon_exists ? icon_path : undefined,
            manifest: json
          })
        } else {
          Console.Group(Console.ErrorStr(`Failed to parse "manifest.json" in ${mod_directory.name}`), () => {
            console.log(AJV_Instance.errorsText(Shard.Manifest.Validator.errors, { separator: '\n' }))
          })
        }
      }
    }
  }

  return shards
}

export function FindShard(fragment: Shard.Reference): Shard.Manifest | undefined {
  const shards = GetShards()

  return shards.filter(s => s.meta.uuid === fragment.uuid).find(s => s.meta.version === fragment.version)
}

export function FindShards(fragments: Shard.Reference[]): Shard.Manifest[] {
  const shards = GetShards()

  const found: Shard.Manifest[] = []

  for (const fragment of fragments) {
    const found_shard = shards.filter(s => s.meta.uuid === fragment.uuid).find(s => s.meta.version === fragment.version)

    if (found_shard) {
      found.push(found_shard)
    }
  }

  return found
}

export function FindExtraShard(fragment: Shard.Reference): Shard.Extra | undefined {
  const shards = GetExtraShards()

  return shards
    .filter(s => s.manifest.meta.uuid === fragment.uuid)
    .find(s => s.manifest.meta.version === fragment.version)
}

export function FindExtraShards(fragments: Shard.Reference[]): Shard.Extra[] {
  const shards = GetExtraShards()

  const found: Shard.Extra[] = []

  for (const fragment of fragments) {
    const found_shard = shards
      .filter(s => s.manifest.meta.uuid === fragment.uuid)
      .find(s => s.manifest.meta.version === fragment.version)

    if (found_shard) {
      found.push(found_shard)
    }
  }

  return found
}
