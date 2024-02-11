import "./SemVersion"
import { SemVersion } from "./SemVersion"

export enum VersionType {
    Release = 0,
    Beta = 1,
    Preview = 2   
};

export class MinecraftVersion {
    version: SemVersion;
    uuid: string;
    versionType: VersionType;

    constructor(version: SemVersion, uuid: string, versionType: VersionType) {
        this.version = version;
        this.uuid = uuid;
        this.versionType = versionType;
    }

    toString(): string {
        let prefix = "";
        if (this.versionType === VersionType.Beta) prefix = "-beta";
        else if (this.versionType === VersionType.Preview) prefix = "-preview";

        return `${this.version.toString()}${prefix}`
    }
}