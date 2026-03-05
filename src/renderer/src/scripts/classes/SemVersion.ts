export class SemVersion {
    major: number;
    minor: number;
    patch: number;
    build: number;

    constructor(major: number, minor: number, patch: number, build: number) {
        this.major = major;
        this.minor = minor;
        this.patch = patch;
        this.build = build;
    }

    static fromString(versionString: string): SemVersion {
        const versionRegex = /^(\d+)\.(\d+)\.(\d+)\.(\d+)/;
        const match = versionString.match(versionRegex);

        if (match) {
            const [, major, minor, patch, build] = match.map(Number);
            return new SemVersion(major, minor, patch, build);
        }

        const newVersionRegex = /^(\d+)\.(\d+)\.(\d+)/;
        const newMatch = versionString.match(newVersionRegex);
        if (newMatch) {
            const [, major, minor, patch] = newMatch.map(Number);
            return new SemVersion(major, minor, patch, 0);
        }

        throw new Error(`Invalid version string format ${versionString}`);
    }

    static fromObject(obj: Object): SemVersion {
        if (!("major" in obj) || !("minor" in obj) || !("patch" in obj) || !("build" in obj)) {
            throw new Error("Object is missing required version properties.");
        }

        const { major, minor, patch, build } = obj as { major: number, minor: number, patch: number, build: number };
        return new SemVersion(major, minor, patch, build);
    }

    static toString(version: SemVersion) {
        return `${version.major}.${version.minor}.${version.patch}.${version.build}`;
    }

    toString(): string {
        return `${this.major}.${this.minor}.${this.patch}.${this.build}`;
    }

    matches(other: SemVersion): boolean {
        return (
            this.major === other.major &&
            this.minor === other.minor &&
            this.patch === other.patch &&
            this.build === other.build
        );
    }
}
