import { useAppStore } from "@renderer/states/AppStore";
import { channelLabel } from "@renderer/scripts/domain/Channel";
import { InstalledVersion } from "@renderer/scripts/versions/InstalledVersion";
import { Popup } from "@renderer/states/PopupStore";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { ProgressBar } from "@renderer/states/ProgressBarStore";
import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { ImportVersionPopup } from "@renderer/popups/ImportVersionPopup";
import { ImportRequest } from "@renderer/scripts/versions/VersionService";

import DeleteIconAsset from "@renderer/assets/images/icons/delete-icon.png";
import OpenFolderIconAsset from "@renderer/assets/images/icons/open-folder-icon.png";
import InfoIconAsset from "@renderer/assets/images/icons/info-icon.png";

import "@renderer/styles/pages/SettingsPage.css";
import "@renderer/styles/pages/LauncherPage.css";

const { shell: { openPath } } = window.require("electron") as typeof import("electron");

const VersionCard = ({ version, canDelete, onInspect, onDelete }: {
    version: InstalledVersion;
    canDelete: boolean;
    onInspect: (version: InstalledVersion) => void;
    onDelete: (version: InstalledVersion) => void;
}) => (
    <div className="version-card">
        <div className="version-card-inner">
            <div className="version-card-info">
                <p className="minecraft-seven version-card-name">
                    {version.label}
                    <span className="minecraft-seven version-picker-item-tag" style={{ marginLeft: 8 }}>
                        {channelLabel(version.channel)}
                    </span>
                </p>
                <p className="minecraft-seven version-card-path">{version.path}</p>
            </div>
            <div className="version-card-actions">
                <div
                    className="version-icon-action version-icon-action-delete"
                    style={canDelete ? undefined : { opacity: 0.4, cursor: "not-allowed", pointerEvents: "none" }}
                    onClick={() => { if (canDelete) onDelete(version); }}
                >
                    <img src={DeleteIconAsset} alt="" />
                </div>
                <div className="version-icon-action version-icon-action-neutral" onClick={() => openPath(version.path)}>
                    <img src={OpenFolderIconAsset} alt="" />
                </div>
                <div className="version-icon-action version-icon-action-neutral" onClick={() => onInspect(version)}>
                    <img src={InfoIconAsset} alt="" />
                </div>
            </div>
        </div>
    </div>
);

export function VersionPage() {
    const versions = useAppStore(state => state.versions);
    const installedVersions = useAppStore(state => state.installedVersions);
    const setError = useAppStore(state => state.setError);
    const canManage = ProgressBar.useCanDoAction("download");

    const startImport = async () => {
        if (!canManage) return;

        const request = await Popup.useAsync<ImportRequest | null>(props => <ImportVersionPopup {...props} />);
        if (!request) return;

        try {
            await versions.importMsixvc(request);
        } catch (e) {
            setError(`Could not import ${request.label}: ${(e as Error).message ?? e}`);
        }
    };

    const inspect = async (version: InstalledVersion) => {
        await Popup.useAsync<void>(({ submit }) => (
            <PopupPanel title={version.label} onClose={() => submit()} size="lg">
                <p className="minecraft-seven" style={{ fontSize: "12px", wordBreak: "break-all" }}>
                    {version.path}
                </p>
                <p className="minecraft-seven" style={{ fontSize: "12px", color: "#9f9f9f" }}>
                    {channelLabel(version.channel)} · {version.version.toString()}
                    {version.packageFamily ? ` · ${version.packageFamily}` : ""}
                    {version.imported ? " · imported" : ""}
                </p>
            </PopupPanel>
        ));
    };

    const remove = async (version: InstalledVersion) => {
        const ok = await confirmAction({
            title: "Delete version?",
            message: `You are about to delete "${version.label}". You can download or import it again later.`,
            confirmText: "Yeah, do it!",
            cancelText: "No, don't do it!",
        });
        if (!ok) return;

        try {
            await versions.uninstall(version.uuid);
        } catch (e) {
            setError(`Could not delete ${version.label}: ${(e as Error).message ?? e}`);
        }
    };

    return (
        <div className="version-page-root">
            <div className="version-page-panel">
                <div className="version-page-header">
                    <p className="minecraft-seven version-page-title">Version Manager</p>
                    <div className="version-header-actions">
                        <div
                            className="version-icon-action version-icon-action-neutral"
                            style={canManage ? undefined : { opacity: 0.4, cursor: "not-allowed", pointerEvents: "none" }}
                            onClick={startImport}
                        >
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                        </div>
                    </div>
                </div>
                <div className="version-page-list scrollbar">
                    {installedVersions.length === 0 && (
                        <p className="minecraft-seven" style={{ color: "#9f9f9f", padding: 12, textAlign: "center" }}>
                            No versions installed yet.
                        </p>
                    )}
                    {installedVersions.map(version => (
                        <VersionCard
                            key={version.uuid}
                            version={version}
                            canDelete={canManage}
                            onInspect={inspect}
                            onDelete={remove}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
}
