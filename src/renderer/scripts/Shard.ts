import { JSONSchemaType } from 'ajv'
import { SemVersion } from './SemVersion'
import AJV_Instance from './AJV_Instance'

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
   *  version: SemVersionData
   *  min_launcher_version: SemVersionData
   *  format?: Shard.Format
   * }
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
    export const Schema: JSONSchemaType<Shard.Full> = {
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

    export const Validator = AJV_Instance.compile<Shard.Full>(Shard.Full.Schema)
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
    export const Schema: JSONSchemaType<Shard.Fragment> = {
      type: 'object',
      properties: {
        uuid: { type: 'string', format: 'uuid' },
        version: SemVersion.Primitive.Schema
      },
      required: ['uuid', 'version'],
      additionalProperties: false
    }

    export const Validator = AJV_Instance.compile<Shard.Fragment>(Shard.Fragment.Schema)
  }
  // endregion

  // region Shard.Format
  export enum Format {
    Mod = 0,
    Runtime = 1
  }

  export namespace Format {
    export const Schema: JSONSchemaType<Shard.Format> = {
      type: 'number',
      enum: [0, 1]
    }
    export const Validator = AJV_Instance.compile<Shard.Format>(Shard.Format.Schema)
  }
  // endregion

  // region Shard.Option
  export type Option =
    | Shard.Option.Empty
    | Shard.Option.Text
    | Shard.Option.Toggle
    | Shard.Option.Radial
    | Shard.Option.Slider

  export namespace Option {
    export interface Empty {
      type: string
      properties?: {
        label?: string
        description?: string
      }
    }
    export interface Text extends Shard.Option.Empty {
      type: 'text'
    }
    export interface Toggle extends Shard.Option.Empty {
      type: 'toggle'
    }
    export interface Radial extends Shard.Option.Empty {
      type: 'radial'
      properties: {
        label?: string
        description?: string
        options: string[]
      }
    }
    export interface Slider extends Shard.Option.Empty {
      type: 'slider'
      properties: {
        label?: string
        description?: string
        min: number
        max: number
      }
    }

    export const Schema: JSONSchemaType<Shard.Option> = {
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

    export const Validator = AJV_Instance.compile<Shard.Option>(Shard.Option.Schema)
  }
  // endregion
}
// endregion
