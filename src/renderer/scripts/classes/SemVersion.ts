export interface SemVersion {
  major: number
  minor: number
  patch: number
  build: number
}

export namespace SemVersion {
  export function toString(sem: SemVersion) {
    return `${sem.major}.${sem.minor}.${sem.patch}.${sem.build}`
  }

  export function fromString(str: string): SemVersion {
    const versionRegex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/
    const match = str.match(versionRegex)

    if (match) {
      const [, major, minor, patch, build] = match.map(Number)
      return { major, minor, patch, build }
    }

    throw new Error(`Invalid version string format ${str}`)
  }
}
