import { Profile, parseProfile } from "./domain/Profile";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");

export class ProfileStore {
    constructor(private readonly filePath: string) {}

    /** No profiles yet is a real state; an unreadable or malformed file is not. */
    load(): Profile[] {
        if (!fs.existsSync(this.filePath)) return [];

        const raw: unknown = JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
        if (!Array.isArray(raw)) throw new Error(`${this.filePath}: expected an array of profiles`);

        return raw.map((entry, index) => parseProfile(entry, `${this.filePath}[${index}]`));
    }

    save(profiles: Profile[]): void {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(profiles, undefined, 4), "utf-8");
    }
}
