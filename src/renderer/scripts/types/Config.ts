import { JSONSchemaType } from 'ajv'
import AJV_Instance from '../schemas/AJV_Instance'
import fs from 'fs'
import { FilePaths } from '../Paths'
import path from 'path'

export interface Config {
  theme: 'Light' | 'Dark' | 'System'
  selected_profile: number | undefined
  registered_profile: number | undefined
  developer_mode: boolean
}

export namespace Config {
  export const Schema: JSONSchemaType<Config> = {
    type: 'object',
    properties: {
      theme: { type: 'string', oneOf: [{ const: 'Light' }, { const: 'Dark' }, { const: 'System' }] },
      selected_profile: { type: 'number', nullable: true },
      registered_profile: { type: 'number', nullable: true },
      developer_mode: { type: 'boolean' }
    },
    required: ['theme', 'developer_mode']
  }

  export const Validator = AJV_Instance.compile<Config>(Schema)

  export function Get(): Config {
    if (fs.existsSync(FilePaths.Config)) {
      const text = fs.readFileSync(FilePaths.Config, 'utf-8')
      const data = JSON.parse(text)

      if (Config.Validator(data)) {
        return data
      } else {
        console.error(Config.Validator.errors)
      }
    }

    return {
      selected_profile: undefined,
      registered_profile: undefined,
      developer_mode: false,
      theme: 'System'
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

export interface ProxyConfig {
  developer_mode: boolean
  runtime: string
  mods: string[]
}

export namespace ProxyConfig {
  export const Schema: JSONSchemaType<ProxyConfig> = {
    type: 'object',
    properties: {
      developer_mode: { type: 'boolean' },
      runtime: { type: 'string' },
      mods: { type: 'array', items: { type: 'string' } }
    },
    required: ['developer_mode', 'runtime', 'mods']
  }

  export const Validator = AJV_Instance.compile<ProxyConfig>(Schema)

  export function Get(): ProxyConfig {
    if (fs.existsSync(FilePaths.Config)) {
      const text = fs.readFileSync(FilePaths.ProxyConfig, 'utf-8')
      const data = JSON.parse(text)

      if (ProxyConfig.Validator(data)) {
        return data
      } else {
        console.error(ProxyConfig.Validator.errors)
      }
    }

    return {
      developer_mode: false,
      runtime: 'Vanilla',
      mods: []
    }
  }

  export function Set(config: ProxyConfig) {
    if (ProxyConfig.Validator(config)) {
      if (!fs.existsSync(FilePaths.ProxyConfig)) {
        fs.mkdirSync(path.dirname(FilePaths.ProxyConfig), { recursive: true })
      }
      fs.writeFileSync(FilePaths.ProxyConfig, JSON.stringify(config, undefined, 4))
    } else {
      console.error(ProxyConfig.Validator.errors)
    }
  }
}
