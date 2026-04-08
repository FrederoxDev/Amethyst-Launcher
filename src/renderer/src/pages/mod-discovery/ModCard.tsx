import { useEffect, useState } from "react";
import { ModDiscoveryData } from "./ModDiscoveryTypes";

export const iconCache = new Map<string, string>();
export const readmeCache = new Map<string, string>();
export const releasesCache = new Map<string, import("./ModDiscoveryTypes").ParsedGithubRelease[]>();

export function useCachedIcon(url: string): string {
    const [src, setSrc] = useState(() => iconCache.get(url) ?? url);

    useEffect(() => {
        if (iconCache.has(url)) {
            setSrc(iconCache.get(url)!);
            return;
        }

        let revoked = false;
        fetch(url)
            .then(res => res.blob())
            .then(blob => {
                if (revoked) return;
                const blobUrl = URL.createObjectURL(blob);
                iconCache.set(url, blobUrl);
                setSrc(blobUrl);
            })
            .catch(() => {});

        return () => {
            revoked = true;
        };
    }, [url]);

    return src;
}

export function ModCard({ mod, onOpenDetails }: { mod: ModDiscoveryData; onOpenDetails: () => void }) {
    const bannerSrc = useCachedIcon(mod.bannerUrl ?? mod.iconUrl);
    const [imgError, setImgError] = useState(false);
    return (
        <div className="mod-card" onClick={onOpenDetails}>
            {imgError ? (
                <div className="mod-card-icon mod-card-icon-placeholder" />
            ) : (
                <img
                    src={bannerSrc}
                    alt={`${mod.name} banner`}
                    className="mod-card-icon"
                    onError={() => setImgError(true)}
                />
            )}
            <div className="mod-card-body">
                <h3 className="minecraft-seven mod-card-title">{mod.name}</h3>
                <p className="minecraft-seven mod-card-authors">{mod.authors.join(", ")}</p>
                <p className="minecraft-seven mod-card-description">{mod.description}</p>
            </div>
            <div className="mod-card-footer">
                <div className="mod-card-installs">
                    <svg
                        width="12"
                        height="12"
                        viewBox="0 0 16 16"
                        fill="none"
                        stroke="#a0a0a0"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    >
                        <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2 14h12" />
                    </svg>
                    <span className="minecraft-seven">{mod.downloads}</span>
                </div>
            </div>
        </div>
    );
}
