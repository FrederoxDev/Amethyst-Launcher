import Ajv from 'ajv'
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
    authors: string[]
  }
}

export interface ModConfigV1 {
  format_version: '1.0.0'
  meta: {
    is_runtime?: boolean
    author?: string
    name: string
    version: string
  }
}

const ModConfigSchemaV1 = {
  type: 'object',
  properties: {
    format_version: { type: 'string', const: '1.0.0' },
    meta: {
      type: 'object',
      properties: {
        is_runtime: {
          type: 'boolean'
        },
        name: {
          type: 'string'
        },
        version: {
          type: 'string'
        },
        author: {
          type: 'string'
        }
      },
      required: ['name', 'version']
    }
  },
  required: ['format_version', 'meta']
}

export const ValidateModSchemaV1 = ajv.compile(ModConfigSchemaV1)

export const FromValidatedV1ToConfig = (validated: ModConfigV1): ModConfig => {
  let authors: string[] = []
  if (validated.meta.author) authors = [validated.meta.author]

  return {
    format_version: validated.format_version,
    meta: {
      name: validated.meta.name,
      version: validated.meta.version,
      type: validated.meta.is_runtime ? 'runtime' : 'mod',
      authors: authors
    }
  }
}
