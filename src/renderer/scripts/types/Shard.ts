import { FolderPaths } from '../Paths'
import * as fs from 'node:fs'
import path from 'path'
import { Console } from './Console'
import { DefinedError, JSONSchemaType } from 'ajv'
import { SemVersion } from './SemVersion'
import AJV_Instance from '../schemas/AJV_Instance'

export default Shard

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
  export type Option = Option.Empty | Option.Text | Option.Toggle | Option.Radial | Option.Slider

  export namespace Option {
    export interface Empty {
      type: string
      properties?: {
        label?: string
        description?: string
      }
    }
    export interface Text extends Empty {
      type: 'text'
    }
    export interface Toggle extends Empty {
      type: 'toggle'
    }
    export interface Radial extends Empty {
      type: 'radial'
      properties: {
        label?: string
        description?: string
        options: string[]
      }
    }
    export interface Slider extends Empty {
      type: 'slider'
      properties: {
        label?: string
        description?: string
        min: number
        max: number
      }
    }

    export const Schema: JSONSchemaType<Option> = {
      oneOf: [
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'empty'
            },
            properties: {
              type: 'object',
              properties: {
                label: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true }
              },
              nullable: true,
              additionalProperties: false
            }
          },
          required: ['type'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'text'
            },
            properties: {
              type: 'object',
              properties: {
                label: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true }
              },
              nullable: true,
              additionalProperties: false
            }
          },
          required: ['type'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'toggle'
            },
            properties: {
              type: 'object',
              properties: {
                label: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true }
              },
              nullable: true,
              additionalProperties: false
            }
          },
          required: ['type'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'radial'
            },
            properties: {
              type: 'object',
              properties: {
                label: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                options: { type: 'array', items: { type: 'string' } }
              },
              required: ['options'],
              additionalProperties: false
            }
          },
          required: ['type', 'properties'],
          additionalProperties: false
        },
        {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              const: 'slider'
            },
            properties: {
              type: 'object',
              properties: {
                label: { type: 'string', nullable: true },
                description: { type: 'string', nullable: true },
                min: { type: 'number' },
                max: { type: 'number' }
              },
              required: ['min', 'max'],
              additionalProperties: false
            }
          },
          required: ['type', 'properties'],
          additionalProperties: false
        }
      ]
    }

    export const Validator = AJV_Instance.compile<Option>(Schema)
  }
  // endregion

  // region Shard.Fragment
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
  export interface Fragment {
    name: string
    uuid: string
    version: SemVersion.Primitive
  }

  export namespace Fragment {
    export const Schema: JSONSchemaType<Fragment> = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        uuid: { type: 'string', format: 'uuid' },
        version: SemVersion.Primitive.Schema
      },
      required: ['uuid', 'version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Fragment>(Schema)
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
   * @see {Shard.Fragment}
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
    dependencies?: Shard.Fragment[]
    options?: Shard.Option[]
  }

  export namespace Manifest {
    export function toFragment(shard: Shard.Manifest): Shard.Fragment {
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
          items: Shard.Fragment.Schema,
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
    data: Shard.Manifest
  }

  export namespace Extra {
    export const Schema: JSONSchemaType<Extra> = {
      type: 'object',
      properties: {
        path: { type: 'string' },
        manifest_path: { type: 'string' },
        icon_path: { type: 'string', nullable: true },
        data: Manifest.Schema
      },
      required: ['path', 'manifest_path', 'data']
    }

    export const Validator = AJV_Instance.compile<Extra>(Schema)
  }
  // endregion
}

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
            console.log(...(Shard.Manifest.Validator.errors as DefinedError[]))
          })
        }
      }
    }
  }

  return shards
}

export function GetUIShards(): Shard.Extra[] {
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
            data: json
          })
        } else {
          Console.Group(Console.ErrorStr(`Failed to parse "manifest.json" in ${mod_directory.name}`), () => {
            console.log(...(Shard.Manifest.Validator.errors as DefinedError[]))
          })
        }
      }
    }
  }

  return shards
}

export function FindShard(shard: Shard.Fragment): Shard.Manifest | undefined {
  const shards = GetShards()

  return shards.filter(s => s.meta.uuid === shard.uuid).find(s => s.meta.version === shard.version)
}
