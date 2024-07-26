import { JSONSchemaType } from 'ajv'
import { SemVersion } from './SemVersion'
import AJV_Instance from '../schemas/AJV_Instance'
import fs from 'fs'
import { FolderPaths } from '../Paths'
import path from 'path'
import { Console } from './Console'

// region Shard
export namespace Shard {
  // region Shard.Full
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
   * options?: Shard.Option[]
   * ```
   *
   * @external
   * @see {Shard.Fragment}
   * @see {Shard.Format}
   * @see {Shard.Option}
   * @see {SemVersion.Primitive}
   */
  export interface Full {
    meta: {
      name: string
      author: string | string[]
      description?: string
      uuid: string
      version: SemVersion.Primitive
      format?: Shard.Format
    },
    format_version: SemVersion.Primitive
    options?: Shard.Option[]
  }
  export namespace Full {
    export const Schema: JSONSchemaType<Full> = {
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
            format: { oneOf: [Shard.Format.Schema], nullable: true }
          },
          required: ['name', 'author', 'uuid', 'version'],
          additionalProperties: false
        },
        format_version: SemVersion.Primitive.Schema,
        options: {
          type: 'array',
          items: Option.Schema,
          nullable: true
        }
      },
      required: ['meta', 'format_version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Full>(Schema)

    export function toFragment(shard: Shard.Full): Shard.Fragment {
      return { uuid: shard.meta.uuid, version: shard.meta.version }
    }
  }
  // endregion

  // region Shard.Fragment
  /**
   * Contains minimal data. Mainly used **internally**
   *
   * ```ts
   * uuid: string // Must be UUID v4
   * version: SemVersionData
   * ```
   *
   * @internal
   * @see {Shard.Full}
   * @see {SemVersion.Primitive}
   */
  export interface Fragment {
    uuid: string
    version: SemVersion.Primitive
  }
  export namespace Fragment {
    export const Schema: JSONSchemaType<Fragment> = {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        version: SemVersion.Primitive.Schema
      },
      required: ['uuid', 'version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Fragment>(Schema)
  }
  // endregion

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
  export type Option =
    | Option.Empty
    | Option.Text
    | Option.Toggle
    | Option.Radial
    | Option.Slider

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

  // region Shard.List
  export interface List {
    mods: Full[]
    runtimes: Full[]
  }
  // endregion
}
// endregion

export function GetShards(): Shard.List {
  if (fs.existsSync(FolderPaths.Mods)) {
    const shards: Shard.List = {
      mods: [],
      runtimes: []
    }

    const mod_directories = fs.readdirSync(FolderPaths.Mods, { withFileTypes: true }).filter(entry => entry.isDirectory())
    for (const mod_directory of mod_directories) {
      const dir_path = path.join(mod_directory.parentPath, mod_directory.name)

      const config_path = path.join(dir_path, 'mod.json')
      if (fs.existsSync(config_path)) {
        const text = fs.readFileSync(config_path, 'utf-8')
        const json = JSON.parse(text)

        if (Shard.Full.Validator(json)) {
          switch (json.meta.format) {
            case Shard.Format.Mod: {
              shards.mods.push(json)
              break
            }
            case Shard.Format.Runtime: {
              shards.runtimes.push(json)
              break
            }
          }
        }
        else {
          Console.Group(Console.ErrorStr(`Failed to parse \`manifest.json\` in ${mod_directory.name}`), () => {
            console.log(Shard.Full.Validator.errors)
          })
        }
      }
    }

    return shards
  } else {
    return {
      mods: [],
      runtimes: []
    }
  }
}
