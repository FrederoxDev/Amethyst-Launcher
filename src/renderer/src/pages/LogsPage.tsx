import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { describeError, userMessage } from "@shared/diagnostics/Log";
import { MinecraftButton } from "@renderer/components/MinecraftButton";
import { GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButtonPalette";
import { useAppStore } from "@renderer/states/AppStore";
import { log } from "@renderer/scripts/LauncherLog";
import { errnoCode } from "@renderer/scripts/Directories";
import { launcherLogPath } from "@renderer/scripts/diagnostics/RendererLog";
import { confirmAction } from "@renderer/popups/ConfirmPopup";
import { FULL_PROGRESS_RESET_OPTIONS, ProgressBar } from "@renderer/states/ProgressBarStore";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron") as typeof import("electron");

interface LogFile {
    name: string;
    path: string;
    size: number;
    mtimeMs: number;
}

const LINE_HEIGHT = 18;
const OVERSCAN_LINES = 12;
/** A runtime crash log can reach hundreds of megabytes; only the tail of one is worth reading. */
const MAX_VIEW_BYTES = 4 * 1024 * 1024;
const SEARCH_DEBOUNCE_MS = 200;

function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(ms: number): string {
    const d = new Date(ms);
    return d.toLocaleString();
}

function highlightSegment(text: string, lowerQuery: string, keyPrefix: string): React.ReactNode {
    if (!lowerQuery) return text;
    const lower = text.toLowerCase();
    const parts: React.ReactNode[] = [];
    let i = 0;
    let segIdx = 0;
    while (i < text.length) {
        const idx = lower.indexOf(lowerQuery, i);
        if (idx === -1) {
            if (i === 0) return text;
            parts.push(text.slice(i));
            break;
        }
        if (idx > i) parts.push(text.slice(i, idx));
        parts.push(<mark key={`${keyPrefix}-${segIdx++}`} className="logs-viewer-highlight">{text.slice(idx, idx + lowerQuery.length)}</mark>);
        i = idx + lowerQuery.length;
    }
    return parts;
}

// The runtime writes `[thread] [mod] [LEVEL] message`; the launcher prefixes a clock time.
const LINE_REGEX = /^(?:(\d{2}:\d{2}:\d{2}\.\d{3})\s)?(\[[^\]]+\])\s(\[[^\]]+\])(?:\s\[([A-Z]+)\])?(\s.*)?$/;

interface ParsedLine {
    raw: string;
    time: string | null;
    thread: string | null;
    mod: string | null;
    level: string;
    rest: string | null;
}

function parseLine(rawLine: string): ParsedLine {
    const line = rawLine.replace(/\r$/, "");
    const match = LINE_REGEX.exec(line);
    if (!match) return { raw: line, time: null, thread: null, mod: null, level: "INFO", rest: null };
    const [, time, thread, mod, level, rest] = match;
    return { raw: line, time: time ?? null, thread, mod, level: level ?? "INFO", rest: rest ?? null };
}

interface LogTail {
    lines: ParsedLine[];
    /** Full size of the file when only its last `MAX_VIEW_BYTES` were loaded. */
    truncatedFrom: number | null;
}

async function readLogTail(file: string): Promise<LogTail> {
    const handle = await fs.promises.open(file, "r");
    try {
        const { size } = await handle.stat();
        const length = Math.min(size, MAX_VIEW_BYTES);
        const buffer = Buffer.alloc(length);
        await handle.read(buffer, 0, length, size - length);
        const text = buffer.toString("utf-8");
        if (length === size) return { lines: text.split("\n").map(parseLine), truncatedFrom: null };
        return { lines: text.slice(text.indexOf("\n") + 1).split("\n").map(parseLine), truncatedFrom: size };
    } finally {
        await handle.close();
    }
}

function levelClass(level: string): string {
    switch (level) {
        case "ERROR": return "logs-line-level-error";
        case "WARN":
        case "WARNING": return "logs-line-level-warn";
        case "DEBUG":
        case "TRACE": return "logs-line-level-debug";
        default: return "logs-line-level-info";
    }
}

function renderParsedLine(p: ParsedLine, lineIdx: number, lowerQuery: string): React.ReactNode {
    if (!p.thread || !p.mod) {
        return <div key={lineIdx} className="logs-line">{highlightSegment(p.raw || " ", lowerQuery, `l${lineIdx}`)}</div>;
    }
    const cls = levelClass(p.level);
    const showLevelTag = p.level !== "INFO";
    return (
        <div key={lineIdx} className="logs-line">
            {p.time && <span className="logs-line-meta">{highlightSegment(p.time, lowerQuery, `l${lineIdx}c`)}</span>}
            {p.time && " "}
            <span className="logs-line-meta">{highlightSegment(p.thread, lowerQuery, `l${lineIdx}t`)}</span>
            {" "}
            <span className="logs-line-meta">{highlightSegment(p.mod, lowerQuery, `l${lineIdx}m`)}</span>
            {showLevelTag && " "}
            {showLevelTag && <span className={cls}>{highlightSegment(`[${p.level}]`, lowerQuery, `l${lineIdx}e`)}</span>}
            {p.rest && <span className={showLevelTag ? cls : undefined}>{highlightSegment(p.rest, lowerQuery, `l${lineIdx}r`)}</span>}
        </div>
    );
}

function countMatches(lines: ParsedLine[], lowerQuery: string): number {
    if (!lowerQuery) return 0;
    let n = 0;
    for (let i = 0; i < lines.length; i++) {
        const s = lines[i].raw.toLowerCase();
        let j = 0;
        while (true) {
            const idx = s.indexOf(lowerQuery, j);
            if (idx === -1) break;
            n++;
            j = idx + lowerQuery.length;
        }
    }
    return n;
}

interface VirtualLogViewProps {
    lines: ParsedLine[];
    query: string;
}

function VirtualLogView({ lines, query }: VirtualLogViewProps) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [scrollTop, setScrollTop] = useState(0);
    const [viewportH, setViewportH] = useState(400);
    const lowerQuery = query.toLowerCase();

    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        setViewportH(el.clientHeight);
        const onScroll = () => setScrollTop(el.scrollTop);
        el.addEventListener("scroll", onScroll, { passive: true });
        const ro = new ResizeObserver(() => setViewportH(el.clientHeight));
        ro.observe(el);
        return () => {
            el.removeEventListener("scroll", onScroll);
            ro.disconnect();
        };
    }, []);

    const [shownLines, setShownLines] = useState(lines);
    if (shownLines !== lines) {
        setShownLines(lines);
        setScrollTop(0);
    }

    // The virtual window follows `scrollTop`, so the node has to be moved back to match it.
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (el) el.scrollTop = 0;
    }, [lines]);

    const totalH = lines.length * LINE_HEIGHT;
    const start = Math.max(0, Math.floor(scrollTop / LINE_HEIGHT) - OVERSCAN_LINES);
    const end = Math.min(lines.length, Math.ceil((scrollTop + viewportH) / LINE_HEIGHT) + OVERSCAN_LINES);

    const visible: React.ReactNode[] = [];
    for (let i = start; i < end; i++) {
        visible.push(renderParsedLine(lines[i], i, lowerQuery));
    }

    return (
        <div ref={containerRef} className="logs-viewer-content scrollbar">
            <div style={{ height: totalH, position: "relative" }}>
                <div style={{ position: "absolute", top: start * LINE_HEIGHT, left: 0, minWidth: "100%" }}>
                    {visible}
                </div>
            </div>
        </div>
    );
}

interface CheckboxFilterProps {
    label: string;
    options: string[];
    selected: Set<string>;
    setSelected: (next: Set<string>) => void;
}

function CheckboxFilter({ label, options, selected, setSelected }: CheckboxFilterProps) {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const close = (e: MouseEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener("mousedown", close);
        return () => document.removeEventListener("mousedown", close);
    }, [open]);

    const toggle = (value: string) => {
        const next = new Set(selected);
        if (next.has(value)) next.delete(value);
        else next.add(value);
        setSelected(next);
    };

    const summary = selected.size === 0 ? "All" : `${selected.size} selected`;

    return (
        <div className="logs-filter-root" ref={rootRef}>
            <span className="minecraft-seven logs-filter-label">{label}</span>
            <div className="logs-filter-trigger-wrap">
                <div className="logs-filter-trigger" onClick={() => setOpen(o => !o)}>
                    <span className="minecraft-seven logs-filter-trigger-text">{summary}</span>
                    <svg width="8" height="6" viewBox="0 0 8 6"><path d="M0 0l4 6 4-6z" fill="#a0a0a0" /></svg>
                </div>
                {open && (
                    <div className="logs-filter-panel">
                    {options.length === 0 && <p className="minecraft-seven logs-filter-empty">No values</p>}
                    {options.map(opt => {
                        const checked = selected.has(opt);
                        return (
                            <div key={opt} className="logs-filter-option" onClick={() => toggle(opt)}>
                                <div className={`logs-filter-checkbox${checked ? " checked" : ""}`}>
                                    {checked && (
                                        <svg width="10" height="10" viewBox="0 0 10 10">
                                            <path d="M1 5l3 3 5-6" stroke="#FFFFFF" strokeWidth="2" fill="none" strokeLinecap="square" />
                                        </svg>
                                    )}
                                </div>
                                <span className="minecraft-seven logs-filter-option-text">{opt}</span>
                            </div>
                        );
                    })}
                    </div>
                )}
            </div>
        </div>
    );
}

export function LogsPage() {
    const platform = useAppStore(state => state.platform);
    const setError = useAppStore(state => state.setError);
    const logsDir = useMemo(() => path.join(platform.getPaths().amethystPath, "Launcher", "Logs"), [platform]);

    const [files, setFiles] = useState<LogFile[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [lines, setLines] = useState<ParsedLine[]>([]);
    const [truncatedFrom, setTruncatedFrom] = useState<number | null>(null);
    const [fileQuery, setFileQuery] = useState<string>("");
    const [contentQuery, setContentQuery] = useState<string>("");
    const [activeQuery, setActiveQuery] = useState<string>("");
    const [threadFilter, setThreadFilter] = useState<Set<string>>(new Set());
    const [modFilter, setModFilter] = useState<Set<string>>(new Set());
    const [levelFilter, setLevelFilter] = useState<Set<string>>(new Set());
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: LogFile } | null>(null);
    const contextMenuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!contextMenu) return;
        const close = (e: MouseEvent) => {
            if (contextMenuRef.current && !contextMenuRef.current.contains(e.target as Node)) {
                setContextMenu(null);
            }
        };
        const onScroll = () => setContextMenu(null);
        document.addEventListener("mousedown", close);
        document.addEventListener("scroll", onScroll, true);
        return () => {
            document.removeEventListener("mousedown", close);
            document.removeEventListener("scroll", onScroll, true);
        };
    }, [contextMenu]);

    const deleteLog = async (file: LogFile) => {
        setContextMenu(null);
        const ok = await confirmAction({
            title: "Delete Log?",
            message: `"${file.name}" will be permanently deleted. This cannot be undone.`,
            confirmText: "Delete",
        });
        if (!ok) {
            log("LogsPage", `Deletion of ${file.path} cancelled by the user`);
            return;
        }
        try {
            await fs.promises.unlink(file.path);
            log("LogsPage", `Deleted log ${file.path}`);
            if (selected === file.path) setSelected(null);
            refresh();
        } catch (e) {
            log("LogsPage", `Could not delete ${file.path}: ${describeError(e)}`);
            setError(`Could not delete ${file.name}: ${userMessage(e)}`);
        }
    };

    const copyAsPath = async (file: LogFile) => {
        try {
            await navigator.clipboard.writeText(file.path);
        } catch (e) {
            log("LogsPage", `Could not copy ${file.path} to the clipboard: ${describeError(e)}`);
            setError(`Could not copy the path to ${file.name}: ${userMessage(e)}`);
        }
        setContextMenu(null);
    };

    const showInExplorer = (file: LogFile) => {
        try {
            shell.showItemInFolder(file.path);
        } catch (e) {
            log("LogsPage", `Could not show ${file.path} in the file manager: ${describeError(e)}`);
            setError(`Could not show ${file.name} in the file manager: ${userMessage(e)}`);
        }
        setContextMenu(null);
    };

    const refresh = useCallback(async () => {
        try {
            let entries: string[];
            try {
                entries = await fs.promises.readdir(logsDir);
            } catch (e) {
                if (errnoCode(e) === "ENOENT") {
                    log("LogsPage", `No logs folder at ${logsDir} yet`);
                    setFiles([]);
                    return;
                }
                throw e;
            }
            const loaded = (await Promise.all(entries.map(async name => {
                const full = path.join(logsDir, name);
                try {
                    const stat = await fs.promises.stat(full);
                    if (!stat.isFile()) return null;
                    return { name, path: full, size: stat.size, mtimeMs: stat.mtimeMs } as LogFile;
                } catch (e) {
                    log("LogsPage", `Leaving ${full} out of the list: ${describeError(e)}`);
                    return null;
                }
            }))).filter((f): f is LogFile => f !== null);
            loaded.sort((a, b) => b.mtimeMs - a.mtimeMs);
            setFiles(loaded);
        } catch (e) {
            log("LogsPage", `Could not list ${logsDir}: ${describeError(e)}`);
            setError(`Could not list the logs folder: ${userMessage(e)}`);
        }
    }, [logsDir, setError]);

    useEffect(() => {
        refresh();
    }, [refresh]);

    useEffect(() => {
        setThreadFilter(new Set());
        setModFilter(new Set());
        setLevelFilter(new Set());
        setTruncatedFrom(null);
        setContentQuery("");
        setActiveQuery("");
        if (!selected) {
            setLines([]);
            return;
        }
        let cancelled = false;
        readLogTail(selected)
            .then(tail => {
                if (cancelled) return;
                setLines(tail.lines);
                setTruncatedFrom(tail.truncatedFrom);
            })
            .catch(e => {
                log("LogsPage", `Could not read ${selected}: ${describeError(e)}`);
                if (cancelled) return;
                setLines([]);
                setError(`Could not read ${path.basename(selected)}: ${userMessage(e)}`);
            });
        return () => { cancelled = true; };
    }, [selected, setError]);

    useEffect(() => {
        const timer = setTimeout(() => setActiveQuery(contentQuery), SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [contentQuery]);

    const deleteAllLogs = async () => {
        // The run in progress is still being written to, so deleting it accomplishes nothing:
        // the next line logged brings it straight back, shorter, which is what made "delete all"
        // look like it had left two files behind. It is also the log a user is most likely to
        // need, being the one for whatever they just did.
        const current = launcherLogPath();
        const deletable = files.filter(f => path.resolve(f.path) !== path.resolve(current));

        if (deletable.length === 0) {
            log("LogsPage", `Delete All ignored: ${logsDir} holds nothing but the run in progress`);
            return;
        }
        const ok = await confirmAction({
            title: "Delete All Logs?",
            message: `${deletable.length} log(s) will be permanently deleted. This cannot be undone.\n\n`
                + "The log for the session you are in now is kept, because it is still being written.",
            confirmText: "Delete All",
        });
        if (!ok) {
            log("LogsPage", `Deletion of ${deletable.length} log(s) cancelled by the user`);
            return;
        }
        try {
            await ProgressBar.runAsync(async (state) => {
                state.setMessage(`Clearing ${deletable.length} log(s)...`);
                log("LogsPage", `Deleting ${deletable.length} log(s) in ${logsDir}, keeping the run in progress`);
                await Promise.all(deletable.map(f => fs.promises.unlink(f.path).catch(e => {
                    if ((e as { code?: string }).code === "ENOENT") return;
                    log("LogsPage", `Could not delete ${f.path}: ${describeError(e)}`);
                })));
            }, true, FULL_PROGRESS_RESET_OPTIONS);
            setSelected(null);
            await refresh();
        } catch (e) {
            log("LogsPage", `Clearing the logs folder failed: ${describeError(e)}`);
            setError(`Could not clear the logs folder: ${userMessage(e)}`);
        }
    };

    const openLogsFolder = async () => {
        try {
            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            const openError = await shell.openPath(logsDir);
            log("LogsPage", openError ? `Could not open ${logsDir}: ${openError}` : `Opened ${logsDir}`);
        } catch (e) {
            log("LogsPage", `Could not open ${logsDir}: ${describeError(e)}`);
            setError(`Could not open the logs folder: ${userMessage(e)}`);
        }
    };

    const copySelected = async () => {
        if (!selected) return;
        try {
            await navigator.clipboard.writeText(await fs.promises.readFile(selected, "utf-8"));
            log("LogsPage", `Copied ${selected} to the clipboard`);
        } catch (e) {
            log("LogsPage", `Could not copy ${selected} to the clipboard: ${describeError(e)}`);
            setError(`Could not copy ${path.basename(selected)}: ${userMessage(e)}`);
        }
    };

    const filteredFiles = useMemo(() => {
        if (!fileQuery) return files;
        const q = fileQuery.toLowerCase();
        return files.filter(f => f.name.toLowerCase().includes(q));
    }, [files, fileQuery]);

    const filterOptions = useMemo(() => {
        const threads = new Set<string>();
        const mods = new Set<string>();
        const levels = new Set<string>();
        for (const p of lines) {
            if (p.thread) threads.add(p.thread);
            if (p.mod) mods.add(p.mod);
            levels.add(p.level);
        }
        return {
            threads: Array.from(threads).sort(),
            mods: Array.from(mods).sort(),
            levels: Array.from(levels).sort(),
        };
    }, [lines]);

    const filteredLines = useMemo(() => {
        if (threadFilter.size === 0 && modFilter.size === 0 && levelFilter.size === 0) {
            return lines;
        }
        return lines.filter(p => {
            if (threadFilter.size > 0 && (!p.thread || !threadFilter.has(p.thread))) return false;
            if (modFilter.size > 0 && (!p.mod || !modFilter.has(p.mod))) return false;
            if (levelFilter.size > 0 && !levelFilter.has(p.level)) return false;
            return true;
        });
    }, [lines, threadFilter, modFilter, levelFilter]);

    const matchCount = useMemo(
        () => countMatches(filteredLines, activeQuery.toLowerCase()),
        [filteredLines, activeQuery]
    );

    return (
        <div className="logs-page">
            <div className="logs-header">
                <p className="minecraft-seven logs-title">Logs</p>
                <div className="logs-header-actions">
                    <p className="minecraft-seven logs-total-size">All Logs: {formatSize(files.reduce((sum, f) => sum + f.size, 0))}</p>
                    <MinecraftButton text="Refresh" colorPallete={GRAY_MINECRAFT_BUTTON} onClick={refresh} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "100px" }} />
                    <MinecraftButton text="Open Folder" colorPallete={GRAY_MINECRAFT_BUTTON} onClick={openLogsFolder} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "130px" }} />
                    <MinecraftButton text="Delete All" colorPallete={GRAY_MINECRAFT_BUTTON} onClick={deleteAllLogs} style={{ "--mc-button-container-h": "32px", "--mc-button-container-w": "110px" }} />
                </div>
            </div>

            <div className="logs-body">
                <div className="logs-list-column">
                    <input
                        type="text"
                        className="minecraft-seven logs-search"
                        placeholder="Search file name..."
                        spellCheck={false}
                        value={fileQuery}
                        onChange={e => setFileQuery(e.target.value)}
                    />
                    <div className="logs-list scrollbar">
                        {filteredFiles.length === 0 && (
                            <p className="minecraft-seven logs-empty">
                                {files.length === 0 ? "No log files found." : "No matches."}
                            </p>
                        )}
                        {filteredFiles.map(f => (
                            <div
                                key={f.path}
                                className={`logs-list-item${selected === f.path ? " selected" : ""}`}
                                onClick={() => setSelected(f.path)}
                                onContextMenu={e => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.clientX, y: e.clientY, file: f });
                                }}
                            >
                                <p className="minecraft-seven logs-list-item-name">{f.name}</p>
                                <p className="minecraft-seven logs-list-item-meta">{formatTime(f.mtimeMs)} &middot; {formatSize(f.size)}</p>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="logs-viewer">
                    {selected ? (
                        <>
                            <div className="logs-viewer-header">
                                <div className="logs-viewer-name-wrap">
                                    <p className="minecraft-seven logs-viewer-name">{path.basename(selected)}</p>
                                    {(() => {
                                        const f = files.find(x => x.path === selected);
                                        return f ? <p className="minecraft-seven logs-viewer-size">{formatSize(f.size)}</p> : null;
                                    })()}
                                </div>
                                <div className="logs-viewer-search-wrap">
                                    <input
                                        type="text"
                                        className="minecraft-seven logs-search logs-search-inline"
                                        placeholder="Search in log..."
                                        spellCheck={false}
                                        value={contentQuery}
                                        onChange={e => setContentQuery(e.target.value)}
                                    />
                                    {activeQuery && (
                                        <span className="minecraft-seven logs-viewer-match-count">
                                            {matchCount} {matchCount === 1 ? "match" : "matches"}
                                        </span>
                                    )}
                                </div>
                                <MinecraftButton text="Copy" colorPallete={GRAY_MINECRAFT_BUTTON} onClick={copySelected} style={{ "--mc-button-container-h": "28px", "--mc-button-container-w": "80px" }} />
                            </div>
                            <div className="logs-viewer-filters">
                                <CheckboxFilter label="Level" options={filterOptions.levels} selected={levelFilter} setSelected={setLevelFilter} />
                                <CheckboxFilter label="Thread" options={filterOptions.threads} selected={threadFilter} setSelected={setThreadFilter} />
                                <CheckboxFilter label="Mod" options={filterOptions.mods} selected={modFilter} setSelected={setModFilter} />
                                {(threadFilter.size > 0 || modFilter.size > 0 || levelFilter.size > 0) && (
                                    <span className="minecraft-seven logs-viewer-filter-clear" onClick={() => { setThreadFilter(new Set()); setModFilter(new Set()); setLevelFilter(new Set()); }}>Clear</span>
                                )}
                            </div>
                            {truncatedFrom !== null && (
                                <p className="minecraft-seven logs-viewer-truncated">
                                    Showing the last {formatSize(MAX_VIEW_BYTES)} of {formatSize(truncatedFrom)}. Copy or open the file for the rest.
                                </p>
                            )}
                            <VirtualLogView lines={filteredLines} query={activeQuery} />
                        </>
                    ) : (
                        <p className="minecraft-seven logs-empty">Select a log to view.</p>
                    )}
                </div>
            </div>
            {contextMenu && (
                <div
                    ref={contextMenuRef}
                    className="logs-context-menu"
                    style={{ top: contextMenu.y, left: contextMenu.x }}
                >
                    <div className="logs-context-menu-item" onClick={() => showInExplorer(contextMenu.file)}>
                        <p className="minecraft-seven">Open in Explorer</p>
                    </div>
                    <div className="logs-context-menu-item" onClick={() => copyAsPath(contextMenu.file)}>
                        <p className="minecraft-seven">Copy as path</p>
                    </div>
                    <div className="logs-context-menu-item logs-context-menu-item-danger" onClick={() => deleteLog(contextMenu.file)}>
                        <p className="minecraft-seven">Delete</p>
                    </div>
                </div>
            )}
        </div>
    );
}
