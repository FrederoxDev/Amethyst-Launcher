import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDownloadStore } from "@renderer/states/DownloadStore";

export function DownloadManagerButton() {
    const downloads = useDownloadStore(state => state.downloads);
    const panelOpen = useDownloadStore(state => state.panelOpen);
    const setPanelOpen = useDownloadStore(state => state.setPanelOpen);
    const updateDownload = useDownloadStore(state => state.updateDownload);
    const removeDownload = useDownloadStore(state => state.removeDownload);

    const btnRef = useRef<HTMLDivElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [panelPos, setPanelPos] = useState({ bottom: 0, left: 0 });

    const activeCount = downloads.filter(d => d.status === "downloading" || d.status === "extracting" || d.status === "queued").length;

    useEffect(() => {
        if (!panelOpen) return;
        const handleClick = (e: MouseEvent) => {
            if (
                btnRef.current && !btnRef.current.contains(e.target as Node) &&
                panelRef.current && !panelRef.current.contains(e.target as Node)
            ) {
                setPanelOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClick);
        return () => document.removeEventListener("mousedown", handleClick);
    }, [panelOpen]);

    useEffect(() => {
        if (!panelOpen || !btnRef.current) return;
        const rect = btnRef.current.getBoundingClientRect();
        setPanelPos({
            bottom: window.innerHeight - rect.bottom,
            left: rect.right + 10,
        });
    }, [panelOpen]);

    const cancelDownload = (id: string) => {
        const dl = downloads.find(d => d.id === id);
        if (dl?.abortController) {
            dl.abortController.abort();
        }
        removeDownload(id);
    };

    return (
        <div className="download-manager-btn" ref={btnRef} data-tooltip="Downloads" onClick={() => setPanelOpen(!panelOpen)}>
            <svg width="20" height="20" viewBox="0 0 16 16" fill="none" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round">
                <path d="M8 2v8M4.5 7.5L8 11l3.5-3.5M2 14h12" />
            </svg>
            {activeCount > 0 && <div className="download-manager-badge" />}

            {panelOpen && createPortal(
                <div
                    className="download-manager-panel"
                    ref={panelRef}
                    style={{ bottom: panelPos.bottom, left: panelPos.left }}
                    onClick={e => e.stopPropagation()}
                >
                    <p className="minecraft-seven download-manager-title">Downloads</p>
                    <div className="download-manager-list scrollbar">
                        {downloads.length === 0 && (
                            <p className="minecraft-seven download-manager-empty">No downloads</p>
                        )}
                        {downloads.map(dl => (
                            <div key={dl.id} className="download-manager-item">
                                <div className="download-manager-item-info">
                                    <p className="minecraft-seven download-manager-item-name">{dl.name}</p>
                                    <p className="minecraft-seven download-manager-item-status">
                                        {dl.status === "downloading" ? `${Math.round(dl.progress * 100)}%` : dl.status}
                                    </p>
                                    {(dl.status === "downloading" || dl.status === "queued") && (
                                        <div className="download-manager-item-cancel" onClick={() => cancelDownload(dl.id)}>
                                            <svg width="10" height="10" viewBox="0 0 12 12">
                                                <path d="M2 2L10 10M10 2L2 10" stroke="#9f9f9f" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                    )}
                                    {(dl.status === "done" || dl.status === "error") && (
                                        <div className="download-manager-item-cancel" onClick={() => removeDownload(dl.id)}>
                                            <svg width="10" height="10" viewBox="0 0 12 12">
                                                <path d="M2 2L10 10M10 2L2 10" stroke="#9f9f9f" strokeWidth="2" strokeLinecap="round" />
                                            </svg>
                                        </div>
                                    )}
                                </div>
                                <div className="download-manager-progress-track">
                                    <div
                                        className={`download-manager-progress-fill ${dl.status === "error" ? "download-manager-progress-error" : ""}`}
                                        style={{ width: `${Math.round(dl.progress * 100)}%` }}
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
}
