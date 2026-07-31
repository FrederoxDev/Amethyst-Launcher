/** Minecraft Bedrock ships two independent channels; each has its own appx package and data folder. */
export type Channel = "release" | "preview";

export const CHANNELS: readonly Channel[] = ["release", "preview"];

export function isChannel(value: unknown): value is Channel {
    return value === "release" || value === "preview";
}

export function parseChannel(value: unknown): Channel | null {
    if (isChannel(value)) return value;
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (isChannel(lower)) return lower;
    }
    return null;
}

export function channelLabel(channel: Channel): string {
    return channel === "preview" ? "Preview" : "Release";
}
