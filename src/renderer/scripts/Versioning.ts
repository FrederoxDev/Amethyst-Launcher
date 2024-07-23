import AJV, { JSONSchemaType } from 'ajv'

import { SemVersion } from './classes/SemVersion'

/////////////////////////////
// EXPERIMENTAL VERSIONING //
/////////////////////////////

export interface Version {
  uuid: string
  path: string
}

// region VersionData
export interface VersionData {
  uuid: string
  sem_version: SemVersion
  type: VersionType
}

export namespace VersionData {
  export function toString(data: VersionData) {
    return `${SemVersion.toString(data.sem_version)}${['', '-beta', '-preview'][data.type]}`
  }
}
// endregion

export enum VersionType {
  Release = 0,
  Beta = 1,
  Preview = 2
}

export interface VersionsFile {
  default_path: string
  versions: Version[]
}

// region JSON Schemas
export const Version_Schema: JSONSchemaType<Version> = {
  type: 'object',
  properties: {
    uuid: {
      type: 'string',
      nullable: false
    },
    path: {
      type: 'string',
      nullable: false
    }
  },
  required: ['uuid', 'path'],
  additionalProperties: false
}

export const VersionsFile_Schema: JSONSchemaType<VersionsFile> = {
  type: 'object',
  properties: {
    default_path: {
      type: 'string',
      nullable: false
    },
    versions: {
      type: 'array',
      nullable: false,
      items: Version_Schema
    }
  },
  required: ['default_path', 'versions'],
  additionalProperties: false
}
// endregion

const JSON_Validator = new AJV({ allErrors: true })
export const VersionsFile_Validator = JSON_Validator.compile<VersionsFile>(VersionsFile_Schema)
