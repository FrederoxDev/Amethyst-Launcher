import { useMemo, useState } from "react";

import { Dropdown } from "@renderer/components/Dropdown";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { PopupPanel } from "@renderer/components/PopupPanel";
import { TextInput } from "@renderer/components/TextInput";
import { SemVersion } from "@renderer/scripts/classes/SemVersion";
import { PathUtils } from "@renderer/scripts/PathUtils";
import {
  Channel,
  channelLabel,
  parseChannel,
} from "@renderer/scripts/domain/Channel";
import {
  channelFromFilename,
  prettifyVersionFromFilename,
} from "@renderer/scripts/versions/Catalog";
import { ImportRequest } from "@renderer/scripts/versions/VersionService";
import { PopupUseArguments } from "@renderer/states/PopupStore";
import { pickMsixvcFile } from "@renderer/scripts/versions/MsixvcPicker";

const path = window.require("path") as typeof import("path");

interface ImportVersionPopupProps extends PopupUseArguments<ImportRequest | null> {
  /** Already-picked file. When absent the popup picks one itself. */
  initialFile?: string;
  /** Used when the filename says nothing about the channel. */
  defaultChannel?: Channel;
  /** Shows a Back button instead of a close-only header, for a multi-step flow. */
  onBack?: () => void;
}

export function ImportVersionPopup({
  submit,
  initialFile,
  defaultChannel,
  onBack,
}: ImportVersionPopupProps) {
  const [file, setFile] = useState<string | null>(initialFile ?? null);
  const [uuid] = useState(() => crypto.randomUUID());

  // The filename is the starting point for every field; typing in a field takes it over.
  const [labelOverride, setLabelOverride] = useState<string | null>(null);
  const [channelOverride, setChannelOverride] = useState<Channel | null>(null);
  const [versionOverride, setVersionOverride] = useState<string | null>(null);

  const detected = useMemo(() => {
    if (!file) return null;
    const name = path.basename(file, ".msixvc");
    return {
      version:
        prettifyVersionFromFilename(name) ??
        name.match(/\d+\.\d+\.\d+\.\d+/)?.[0] ??
        null,
      channel: channelFromFilename(name),
    };
  }, [file]);

  const versionText = versionOverride ?? detected?.version ?? "";
  const channel =
    channelOverride ?? detected?.channel ?? defaultChannel ?? "release";
  const label =
    labelOverride ?? `Minecraft ${versionText} (${channelLabel(channel)})`;

  const versionError = useMemo(() => {
    if (versionText === "") return "Version cannot be empty.";
    try {
      SemVersion.fromString(versionText);
      return null;
    } catch {
      return "Version must look like 1.21.60.5 or 26.30.03.";
    }
  }, [versionText]);

  const labelValid = label !== "" && PathUtils.isValidFileName(label);
  const canImport = labelValid && !versionError && file !== null;

  const pickFile = async () => {
    const picked = await pickMsixvcFile("ImportVersion");
    if (picked) setFile(picked);
  };

  return (
    <PopupPanel
      title="Import Version"
      onClose={onBack ?? (() => submit(null))}
      size="lg"
      footerAlign={onBack ? "between" : "end"}
      footer={
        <>
          {onBack && (
            <MinecraftButton
              text="Back"
              style={{ "--mc-button-container-w": "100px" }}
              onClick={onBack}
            />
          )}
          <MinecraftButton
            text="Import!"
            disabled={!canImport}
            style={{ "--mc-button-container-w": "100px" }}
            onClick={() => {
              if (!canImport || !file) return;
              submit({
                label,
                channel,
                version: SemVersion.fromString(versionText),
                uuid,
                file,
              });
            }}
          />
        </>
      }
    >
      <TextInput
        label="Version Name"
        text={label}
        setText={setLabelOverride}
        style={{ width: "100%" }}
      />
      {!labelValid && (
        <p style={{ fontSize: "12px", color: "var(--color-danger-text)" }}>
          Invalid version name
        </p>
      )}

      <Dropdown
        id="version-channel"
        labelText="Channel"
        options={["Release", "Preview"]}
        value={channelLabel(channel)}
        setValue={(value) =>
          setChannelOverride(parseChannel(value) ?? "release")
        }
      />

      <TextInput
        label="Version"
        text={versionText}
        setText={setVersionOverride}
        style={{ width: "100%" }}
      />
      {versionError && (
        <p style={{ fontSize: "12px", color: "var(--color-danger-text)" }}>
          {versionError}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <p className="minecraft-seven text-input-label">Version file</p>
          <div
            className="version-icon-action version-icon-action-neutral"
            onClick={pickFile}
            role="button"
            tabIndex={0}
            aria-label="Choose a .msixvc file"
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              pickFile();
            }}
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />
              <path d="M14 2v4a2 2 0 0 0 2 2h4" />
              <path d="M12 12v6" />
              <path d="m15 15-3-3-3 3" />
            </svg>
          </div>
        </div>
        <p
          style={{
            fontSize: "12px",
            color: file
              ? "var(--color-text-muted)"
              : "var(--color-danger-text)",
            wordBreak: "break-all",
          }}
        >
          {file || "No version file selected"}
        </p>
      </div>
    </PopupPanel>
  );
}
