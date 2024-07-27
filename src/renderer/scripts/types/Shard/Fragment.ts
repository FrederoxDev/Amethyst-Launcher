import AJV_Instance from '../../schemas/AJV_Instance'
import { SemVersion } from '../SemVersion'
import { JSONSchemaType } from 'ajv'

/**
 * Contains minimal data. Mainly used **internally**
 *
 * ```ts
 * uuid: string // Must be UUID v4
 * version: SemVersion.Primitive
 * ```
 *
 * @internal
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