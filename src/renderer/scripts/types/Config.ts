import { JSONSchemaType } from 'ajv'
import AJV_Instance from '../schemas/AJV_Instance'

export interface Config {
  theme: 'Light' | 'Dark' | 'System'
  active_profile: number | undefined
  dev_mode: boolean
}

export namespace Config {
  export const Schema: JSONSchemaType<Config> = {
    type: 'object',
    properties: {
      theme: { type: 'string', oneOf: [{ const: 'Light' }, { const: 'Dark' }, { const: 'System' }] },
      active_profile: { type: 'number', nullable: true },
      dev_mode: { type: 'boolean' }
    },
    required: ['theme', 'dev_mode']
  }

  export const Validator = AJV_Instance.compile<Config>(Schema)
}

export interface RuntimeConfig {
  developer_mode: boolean
  runtime: string
  mods: string[]
}

export namespace RuntimeConfig {
  export const Schema: JSONSchemaType<RuntimeConfig> = {
    type: 'object',
    properties: {
      developer_mode: { type: 'boolean' },
      runtime: { type: 'string' },
      mods: { type: 'array', items: { type: 'string' } }
    },
    required: ['developer_mode', 'runtime', 'mods']
  }

  export const Validator = AJV_Instance.compile<RuntimeConfig>(Schema)
}
