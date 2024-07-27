import AJV_Instance from '../../schemas/AJV_Instance'
import { JSONSchemaType } from 'ajv'

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