import { collection, doc, getDocs, increment, updateDoc } from "firebase/firestore";

import { db } from "@renderer/firebase/Firebase";
import { log } from "@renderer/scripts/LauncherLog";
import { describeError } from "@shared/diagnostics/Log";

export interface DiscoveredMod {
    id: string;
    iconUrl: string;
    bannerUrl?: string;
    name: string;
    description: string;
    authors: string[];
    downloads: number;
    githubUrl: string;
    createdAt?: number;

    /** Hides a mod from the discovery page without deleting its record. */
    hidden?: boolean;

    /** Used exclusively for Amethyst org mods, no exceptions will be made to this. */
    isAmethystOrgMod?: boolean;
}

let cachedMods: DiscoveredMod[] | null = null;

export function catalogSnapshot(): DiscoveredMod[] | null {
    return cachedMods;
}

export function invalidateCatalog(): void {
    cachedMods = null;
}

export async function fetchCatalog(): Promise<DiscoveredMod[]> {
    if (cachedMods) return cachedMods;

    const snapshot = await getDocs(collection(db, "mods"));
    const mods = snapshot.docs.map(docSnap => ({
        id: docSnap.id,
        ...docSnap.data(),
    })) as DiscoveredMod[];

    cachedMods = mods;
    log("ModDiscovery", `Loaded ${mods.length} mods from the discovery database`);
    return mods;
}

/** Cosmetic, so it must never fail the install the user actually asked for. */
export async function recordDownload(modId: string): Promise<void> {
    try {
        await updateDoc(doc(db, "mods", modId), { downloads: increment(1) });
        log("ModDiscovery", `Incremented the download count of "${modId}"`);
    } catch (e) {
        log("ModDiscovery", `Could not increment the download count of "${modId}": ${describeError(e)}`);
    }
}
