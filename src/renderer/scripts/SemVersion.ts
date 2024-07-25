import { JSONSchemaType } from 'ajv'
import AJV_Instance from './AJV_Instance'

// region SemVersion
export interface SemVersion {
  major: number
  minor: number
  patch: number
  build?: number
}

export namespace SemVersion {
  export function toString(sem: SemVersion) {
    return `${sem.major}.${sem.minor}.${sem.patch}${sem.build ? `.${sem.build}` : ''}`
  }

  export function fromString(str: string): SemVersion {
    const regex = RegExp(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/)
    const matches = str.match(regex)

    if (matches) {
      const [major, minor, patch, build] = matches.map(Number)
      return { major: major, minor: minor, patch: patch, build: build }
    }

    throw new Error(`Invalid SemVersion string format: ${str}`)
  }

  export function fromArray(arr: number[]): SemVersion {
    if (arr.length <= 4 && arr.length >= 3) {
      return { major: arr[0], minor: arr[1], patch: arr[2], build: arr[3] }
    } else {
      throw new Error(`Invalid SemVersion array format: ${arr.toString()}`)
    }
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
   * @description `string` must match regex: `/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/`
   * @description `number[]` must have size between: `3-4`, inclusive
   */
  export type Primitive = string | number[]

  export namespace Primitive {
    export const Schema: JSONSchemaType<SemVersion.Primitive> = {
      oneOf: [
        {
          type: 'string',
          pattern: RegExp(/^(\d+)\.(\d+)\.(\d+)(?:\.(\d+))?$/).source
        },
        {
          type: 'array',
          items: { type: 'number' },
          minLength: 3,
          maxLength: 4
        }
      ]
    }

    export const Validator = AJV_Instance.compile<SemVersion.Primitive>(SemVersion.Primitive.Schema)
  }
  // endregion
}
// endregion
