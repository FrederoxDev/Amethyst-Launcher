import { JSONSchemaType } from 'ajv'
import AJV_Instance from '../schemas/AJV_Instance'
import fs from 'fs'
import { FilePaths } from '../Paths'
import path from 'path'

export interface Config {
  theme: 'Light' | 'Dark' | 'System'
  active_profile: number | undefined
  dev_mode: boolean
  all_versions: boolean
}

export namespace Config {
  export const Schema: JSONSchemaType<Config> = {
    type: 'object',
    properties: {
      theme: { type: 'string', oneOf: [{ const: 'Light' }, { const: 'Dark' }, { const: 'System' }] },
      active_profile: { type: 'number', nullable: true },
      dev_mode: { type: 'boolean' },
      all_versions: { type: 'boolean' }
    },
    required: ['theme', 'dev_mode']
  }

  export const Validator = AJV_Instance.compile<Config>(Schema)

  export function Get(): Config {
    const text = fs.readFileSync(FilePaths.Config, 'utf-8')
    const data = JSON.parse(text)

    if (Config.Validator(data)) {
      return data
    } else {
      console.error(Config.Validator.errors)
      return {
        active_profile: undefined,
        dev_mode: false,
        all_versions: false,
        theme: 'System'
      }
    }
  }

  export function Set(config: Config) {
    if (Config.Validator(config)) {
      if (!fs.existsSync(FilePaths.Config)) {
        fs.mkdirSync(path.dirname(FilePaths.Config), { recursive: true })
      }
      fs.writeFileSync(FilePaths.Config, JSON.stringify(config, undefined, 4))
    } else {
      console.error(Config.Validator.errors)
    }
  }
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

  export function Get(): RuntimeConfig {
    const text = fs.readFileSync(FilePaths.RuntimeConfig, 'utf-8')
    const data = JSON.parse(text)

    if (RuntimeConfig.Validator(data)) {
      return data
    } else {
      console.error(RuntimeConfig.Validator.errors)
      return {
        developer_mode: false,
        runtime: 'Vanilla',
        mods: []
      }
    }
  }

  export function Set(config: RuntimeConfig) {
    if (RuntimeConfig.Validator(config)) {
      if (!fs.existsSync(FilePaths.RuntimeConfig)) {
        fs.mkdirSync(path.dirname(FilePaths.RuntimeConfig), { recursive: true })
      }
      fs.writeFileSync(FilePaths.RuntimeConfig, JSON.stringify(config, undefined, 4))
    } else {
      console.error(RuntimeConfig.Validator.errors)
    }
  }
}

