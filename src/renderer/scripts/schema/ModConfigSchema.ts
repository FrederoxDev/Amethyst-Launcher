import Ajv from 'ajv'
import { ModConfigSchemaV1, ModConfigSchemaV1_1_0 } from './Schemas'
export const ajv = new Ajv()

/**
 * The intermediate format of ModConfig that is independant of the schema format version.
 */
export interface ModConfig {
  format_version: string
  meta: {
    name: string
    version: string
    
    type: 'runtime' | 'mod'
    authors: string[],

    namespace: string
    uuid: string
  }
}

// export interface ModConfigV1 {
//   format_version: '1.0.0'
//   meta: {
//     is_runtime?: boolean
//     author?: string
//     name: string
//     version: string
//   }
// }

interface ModConfigV1_1_0_Dependency {
  dependency_uuid: string
  dependency_namespace?: string
  version_range: string
}

export interface ModConfigV1_1_0 {
  format_version: '1.1.0'
  meta: {
    name: string
    uuid: string
    version: string,
    namespace: string

    is_runtime?: boolean
    author?: string

    dependencies?: ModConfigV1_1_0_Dependency[]
  }
}

// export const ValidateModSchemaV1 = ajv.compile(ModConfigSchemaV1)

// export const FromValidatedV1ToConfig = (validated: ModConfigV1): ModConfig => {
//   let authors: string[] = []
//   if (validated.meta.author) authors = [validated.meta.author]

//   return {
//     format_version: validated.format_version,
//     meta: {
//       name: validated.meta.name,
//       version: validated.meta.version,
//       type: validated.meta.is_runtime ? 'runtime' : 'mod',
//       authors: authors
//     }
//   }
// }

export const ValidateModSchemaV1_1_0 = ajv.compile(ModConfigSchemaV1_1_0);

export const FromValidatedV1_1_0ToConfig = (validated: ModConfigV1_1_0): ModConfig => {
  let authors: string[] = []
  if (validated.meta.author) authors = [validated.meta.author]

  return {
    format_version: validated.format_version,
    meta: {
      name: validated.meta.name,
      version: validated.meta.version,
      type: validated.meta.is_runtime ? 'runtime' : 'mod',
      authors: authors,
      namespace: validated.meta.namespace,
      uuid: validated.meta.uuid
    }
  }
}