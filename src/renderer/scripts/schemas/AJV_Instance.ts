import Ajv from 'ajv'
import addFormats from 'ajv-formats'

const AJV = new Ajv({ allErrors: true })
addFormats(AJV)

export default AJV
