const iconCache = new Map<string, string>();
const listeners = new Set<() => void>();

export function cachedIcon(url: string): string | undefined {
    return iconCache.get(url);
}

export function subscribeIconCache(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

/** Blob URLs hold their data until revoked, so dropping the map alone would leak every icon. */
export function clearIconCache(): void {
    for (const blobUrl of iconCache.values()) URL.revokeObjectURL(blobUrl);
    iconCache.clear();
    for (const listener of listeners) listener();
}

export async function loadIcon(url: string): Promise<string> {
    const cached = iconCache.get(url);
    if (cached) return cached;

    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} returned ${response.status} ${response.statusText}`);
    const blob = await response.blob();

    const raced = iconCache.get(url);
    if (raced) return raced;

    const blobUrl = URL.createObjectURL(blob);
    iconCache.set(url, blobUrl);
    return blobUrl;
}
