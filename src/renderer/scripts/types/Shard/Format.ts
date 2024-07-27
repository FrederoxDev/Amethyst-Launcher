import { JSONSchemaType } from 'ajv'
import AJV_Instance from '../../schemas/AJV_Instance'

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