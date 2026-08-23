/**
 * Both patterns are anchored at both ends. A version string reaches disk as part of a folder
 * name, so anything the parser accepts is something the launcher will create and delete.
 */
const FOUR_PART = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/;
const THREE_PART = /^(\d+)\.(\d+)\.(\d+)$/;

export class SemVersion {
  major: number;
  minor: number;
  patch: number;
  build: number;
  originalString?: string;

  constructor(
    major: number,
    minor: number,
    patch: number,
    build: number,
    originalString?: string,
  ) {
    this.major = major;
    this.minor = minor;
    this.patch = patch;
    this.build = build;
    this.originalString = originalString;
  }

  static fromString(versionString: string): SemVersion {
    const text = versionString.trim();

    const four = FOUR_PART.exec(text);
    if (four) {
      const [, major, minor, patch, build] = four.map(Number);
      return new SemVersion(major, minor, patch, build, text);
    }

    const three = THREE_PART.exec(text);
    if (three) {
      const [, major, minor, patch] = three.map(Number);
      return new SemVersion(major, minor, patch, 0, text);
    }

    throw new Error(`Invalid version string format ${versionString}`);
  }

  toString(): string {
    return (
      this.originalString ??
      `${this.major}.${this.minor}.${this.patch}.${this.build}`
    );
  }
}
