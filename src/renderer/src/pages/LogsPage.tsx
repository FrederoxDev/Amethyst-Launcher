import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { MinecraftButton, GRAY_MINECRAFT_BUTTON } from "@renderer/components/MinecraftButton";
import { useAppStore } from "@renderer/states/AppStore";
import { confirmAction } from "@renderer/popups/ConfirmPopup";

const fs = window.require("fs") as typeof import("fs");
const path = window.require("path") as typeof import("path");
const { shell } = window.require("electron");

interface LogFile {
    name: string;
    path: string;
    size: number;
    mtimeMs: number;
}

const LINE_HEIGHT = 18;
const OVERSCAN_LINES = 12;

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

const LINE_REGEX = /^(\[[^\]]+\])\s(\[[^\]]+\])(?:\s\[([A-Z]+)\])?(\s.*)?$/;

interface ParsedLine {
    raw: string;
    thread: string | null;
    mod: string | null;
    level: string;
    rest: string | null;
}

function parseLine(rawLine: string): ParsedLine {
    const line = rawLine.replace(/\r$/, "");
    const match = LINE_REGEX.exec(line);
    if (!match) return { raw: line, thread: null, mod: null, level: "INFO", rest: null };
    const [, thread, mod, level, rest] = match;
    return { raw: line, thread, mod, level: level ?? "INFO", rest: rest ?? null };
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

    // reset scroll position when the underlying line set changes
    useLayoutEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        el.scrollTop = 0;
        setScrollTop(0);
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
                <div style={{ position: "absolute", top: start * LINE_HEIGHT, left: 0, right: 0 }}>
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
    const logsDir = useMemo(() => path.join(platform.getPaths().amethystPath, "Launcher", "Logs"), [platform]);

    const [files, setFiles] = useState<LogFile[]>([]);
    const [selected, setSelected] = useState<string | null>(null);
    const [content, setContent] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [fileQuery, setFileQuery] = useState<string>("");
    const [contentQuery, setContentQuery] = useState<string>("");
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
        if (!ok) return;
        try {
            fs.unlinkSync(file.path);
            if (selected === file.path) {
                setSelected(null);
                setContent("");
            }
            refresh();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const copyAsPath = async (file: LogFile) => {
        try {
            await navigator.clipboard.writeText(file.path);
        } catch (e) {
            setError((e as Error).message);
        }
        setContextMenu(null);
    };

    const showInExplorer = (file: LogFile) => {
        try {
            shell.showItemInFolder(file.path);
        } catch (e) {
            setError((e as Error).message);
        }
        setContextMenu(null);
    };

    const refresh = () => {
        try {
            if (!fs.existsSync(logsDir)) {
                setFiles([]);
                return;
            }
            const entries = fs.readdirSync(logsDir);
            const loaded: LogFile[] = [];
            for (const name of entries) {
                const full = path.join(logsDir, name);
                try {
                    const stat = fs.statSync(full);
                    if (!stat.isFile()) continue;
                    loaded.push({ name, path: full, size: stat.size, mtimeMs: stat.mtimeMs });
                } catch { /* ignore individual file errors */ }
            }
            loaded.sort((a, b) => b.mtimeMs - a.mtimeMs);
            setFiles(loaded);
            setError("");
        } catch (e) {
            setError((e as Error).message);
        }
    };

    useEffect(() => {
        refresh();
    }, [logsDir]);

    useEffect(() => {
        if (!selected) {
            setContent("");
            return;
        }
        try {
            setContent(fs.readFileSync(selected, "utf-8"));
        } catch (e) {
            setContent(`Failed to read file: ${(e as Error).message}`);
        }
    }, [selected]);

    const deleteAllLogs = async () => {
        if (files.length === 0) return;
        const ok = await confirmAction({
            title: "Delete All Logs?",
            message: `All ${files.length} log file(s) will be permanently deleted. This cannot be undone.`,
            confirmText: "Delete All",
        });
        if (!ok) return;
        try {
            for (const f of files) {
                try { fs.unlinkSync(f.path); } catch { /* ignore per-file */ }
            }
            setSelected(null);
            setContent("");
            refresh();
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const openLogsFolder = async () => {
        try {
            if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
            await shell.openPath(logsDir);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const copySelected = async () => {
        if (!content) return;
        await navigator.clipboard.writeText(content);
    };

    const filteredFiles = useMemo(() => {
        if (!fileQuery) return files;
        const q = fileQuery.toLowerCase();
        return files.filter(f => f.name.toLowerCase().includes(q));
    }, [files, fileQuery]);

    const parsedLines = useMemo(() => content.split("\n").map(parseLine), [content]);

    const threadOptions = useMemo(() => {
        const set = new Set<string>();
        for (const p of parsedLines) if (p.thread) set.add(p.thread);
        return Array.from(set).sort();
    }, [parsedLines]);

    const modOptions = useMemo(() => {
        const set = new Set<string>();
        for (const p of parsedLines) if (p.mod) set.add(p.mod);
        return Array.from(set).sort();
    }, [parsedLines]);

    const levelOptions = useMemo(() => {
        const set = new Set<string>();
        for (const p of parsedLines) set.add(p.level);
        return Array.from(set).sort();
    }, [parsedLines]);

    useEffect(() => { setThreadFilter(new Set()); setModFilter(new Set()); setLevelFilter(new Set()); }, [selected]);

    const filteredLines = useMemo(() => {
        if (threadFilter.size === 0 && modFilter.size === 0 && levelFilter.size === 0) {
            return parsedLines;
        }
        return parsedLines.filter(p => {
            if (threadFilter.size > 0 && (!p.thread || !threadFilter.has(p.thread))) return false;
            if (modFilter.size > 0 && (!p.mod || !modFilter.has(p.mod))) return false;
            if (levelFilter.size > 0 && !levelFilter.has(p.level)) return false;
            return true;
        });
    }, [parsedLines, threadFilter, modFilter, levelFilter]);

    const lowerContentQuery = contentQuery.toLowerCase();
    const matchCount = useMemo(
        () => countMatches(filteredLines, lowerContentQuery),
        [filteredLines, lowerContentQuery]
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

            {error && <p className="minecraft-seven logs-error">{error}</p>}

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
                                    {contentQuery && (
                                        <span className="minecraft-seven logs-viewer-match-count">
                                            {matchCount} {matchCount === 1 ? "match" : "matches"}
                                        </span>
                                    )}
                                </div>
                                <MinecraftButton text="Copy" colorPallete={GRAY_MINECRAFT_BUTTON} onClick={copySelected} style={{ "--mc-button-container-h": "28px", "--mc-button-container-w": "80px" }} />
                            </div>
                            <div className="logs-viewer-filters">
                                <CheckboxFilter label="Level" options={levelOptions} selected={levelFilter} setSelected={setLevelFilter} />
                                <CheckboxFilter label="Thread" options={threadOptions} selected={threadFilter} setSelected={setThreadFilter} />
                                <CheckboxFilter label="Mod" options={modOptions} selected={modFilter} setSelected={setModFilter} />
                                {(threadFilter.size > 0 || modFilter.size > 0 || levelFilter.size > 0) && (
                                    <span className="minecraft-seven logs-viewer-filter-clear" onClick={() => { setThreadFilter(new Set()); setModFilter(new Set()); setLevelFilter(new Set()); }}>Clear</span>
                                )}
                            </div>
                            <VirtualLogView lines={filteredLines} query={contentQuery} />
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
