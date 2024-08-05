import { JSONSchemaType } from 'ajv'
import AJV_Instance from '../schemas/AJV_Instance'

// region SemVersion
/**
 * @see {SemVersion.Primitive}
 */
export interface SemVersion {
  major: number
  minor: number
  patch: number
  build?: number
}

export namespace SemVersion {
  export function toPrimitive(sem: SemVersion): SemVersion.Primitive {
    if (sem.build) {
      return `${sem.major}.${sem.minor}.${sem.patch}.${sem.build}`
    } else {
      return `${sem.major}.${sem.minor}.${sem.patch}`
    }
  }

  export function fromPrimitive(primitive: SemVersion.Primitive): SemVersion {
    const regex = RegExp(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/).source
    const matches = primitive.match(regex)

    if (matches) {
      const [, major, minor, patch, build] = matches.map(Number)
      return { major: major, minor: minor, patch: patch, build: build }
    }

    throw new Error(`Invalid SemVersion.Primitive string format: ${primitive}`)
  }

  export const Schema: JSONSchemaType<SemVersion> = {
    type: 'object',
    properties: {
      major: { type: 'number' },
      minor: { type: 'number' },
      patch: { type: 'number' },
      build: { type: 'number', nullable: true }
    },
    required: ['major', 'minor', 'patch'],
    additionalProperties: false
  }

  export const Validator = AJV_Instance.compile<SemVersion>(Schema)

  // region SemVersion.Primitive
  /**
   * @description Must match regex: `/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/`
   * @example
   * "1.0.0" pass
   * "1.0.0.0" pass
   * "9.9.9" pass
   * "9.9.9.9" pass
   *
   * "1.00" fail
   * "1.0.0." fail
   * "a.b.c" fail
   * "1.0.0.0.0" fail
   *
   * @see {SemVersion}
   */
  export type Primitive = string

  export namespace Primitive {
    export const Schema: JSONSchemaType<Primitive> = {
      type: 'string',
      pattern: RegExp(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/).source
    }

    export const Validator = AJV_Instance.compile<Primitive>(Schema)

    export function Match(string: string): SemVersion.Primitive | undefined {
      const regex = RegExp(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?/).source
      const matches = string.match(regex)

      if (matches) {
        return matches[0]
      }
    }
  }
  // endregion
}
// endregion
