export class SemVersion {
  major: number
  minor: number
  patch: number
  build: number

  constructor(major: number, minor: number, patch: number, build: number) {
    this.major = major
    this.minor = minor
    this.patch = patch
    this.build = build
  }

  static fromString(versionString: string): SemVersion {
    const versionRegex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/
    const match = versionString.match(versionRegex)

    if (match) {
      const [, major, minor, patch, build] = match.map(Number)
      return new SemVersion(major, minor, patch, build)
    }

    throw new Error(`Invalid version string format ${versionString}`)
  }

  toString(): string {
    return `${this.major}.${this.minor}.${this.patch}.${this.build}`
  }

  matches(other: SemVersion): boolean {
    return (
      this.major === other.major &&
      this.minor === other.minor &&
      this.patch === other.patch &&
      this.build === other.build
    )
  }

  static toString(version: SemVersion) {
    return `${version.major}.${version.minor}.${version.patch}.${version.build}`
  }
}
