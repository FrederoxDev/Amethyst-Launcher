import { JSONSchemaType } from 'ajv'
import { SemVersionData } from './SemVersion'

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
}
// endregion Mod

// region ModData
export interface ModData {
  meta: {
    name: string
    author: string
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
    type: 'object',
    oneOf: [
      {
        properties: {
          type: {
            type: 'string',
            pattern: '^empty$'
          },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string', nullable: true},
              description: { type: 'string', nullable: true},
            },
            nullable: true
          }
        },
        required: ['type']
      },
      {
        properties: {
          type: {
            type: 'string',
            pattern: '^text$'
          },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string', nullable: true},
              description: { type: 'string', nullable: true},
            },
            nullable: true
          }
        },
        required: ['type']
      },
      {
        properties: {
          type: {
            type: 'string',
            pattern: '^toggle$'
          },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string', nullable: true},
              description: { type: 'string', nullable: true},
            },
            nullable: true
          }
        },
        required: ['type']
      },
      {
        properties: {
          type: {
            type: 'string',
            pattern: '^radial$'
          },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string', nullable: true},
              description: { type: 'string', nullable: true},
              options: { type: 'array', items: { type: 'string'}}
            },
            required: ['options']
          }
        },
        required: ['type', 'properties']
      },
      {
        properties: {
          type: {
            type: 'string',
            pattern: '^slider$'
          },
          properties: {
            type: 'object',
            properties: {
              label: { type: 'string', nullable: true},
              description: { type: 'string', nullable: true},
              min: { type: 'number'},
              max: { type: 'number'}
            },
            required: ['min', 'max']
          }
        },
        required: ['type', 'properties']
      }
    ]
  }
}


// endregion