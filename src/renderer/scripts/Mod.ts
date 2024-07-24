import { JSONSchemaType } from 'ajv'
import { SemVersionData } from './SemVersion'
import AJV_Instance from './AJV_Instance'

// region Mod
export interface Mod {
  // UUID v4 string
  uuid: string
  version: SemVersionData
}

export namespace Mod {
  export const Schema: JSONSchemaType<Mod> = {
    type: 'object',
    properties: {
      uuid: { type: 'string', format: 'uuid' },
      version: SemVersionData.Schema
    },
    required: ['uuid', 'version'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<Mod>(Schema)
}
// endregion Mod

// region ModData
export interface ModData {
  meta: {
    name: string
    authors: string | string[]
    description?: string
    uuid: string
    version: SemVersionData
  }
  format: {
    min_launcher_version: SemVersionData
    is_runtime?: boolean
  }
  options?: ModOption[]
}

export namespace ModData {
  export const Schema: JSONSchemaType<ModData> = {
    type: 'object',
    properties: {
      meta: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          authors: {
            oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }]
          },
          description: { type: 'string', nullable: true },
          uuid: { type: 'string', format: 'uuid' },
          version: SemVersionData.Schema
        },
        required: ['name', 'authors', 'uuid', 'version'],
        additionalProperties: false
      },
      format: {
        type: 'object',
        properties: {
          min_launcher_version: SemVersionData.Schema,
          is_runtime: { type: 'boolean', nullable: true }
        },
        required: ['min_launcher_version'],
        additionalProperties: false
      },
      options: {
        type: 'array',
        items: ModOption.Schema,
        nullable: true
      }
    },
    required: ['meta', 'format'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<ModData>(Schema)
}
// endregion

// region ModOptions
export type ModOption = ModOption.Empty | ModOption.Text | ModOption.Toggle | ModOption.Radial | ModOption.Slider

export namespace ModOption {
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

  export const Schema: JSONSchemaType<ModOption> = {
    oneOf: [
      {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            pattern: '^empty$'
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
            pattern: '^text$'
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
            pattern: '^toggle$'
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
            pattern: '^radial$'
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
            pattern: '^slider$'
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

  export const Validator = AJV_Instance.compile<ModOption>(Schema)
}
// endregion
