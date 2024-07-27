import AJV_Instance from '../../schemas/AJV_Instance'
import { SemVersion } from '../SemVersion'
import { JSONSchemaType } from 'ajv'

import Shard from '../Shard'

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
        items: Shard.Option.Schema,
        nullable: true
      }
    },
    required: ['meta', 'format_version'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<Full>(Schema)
}