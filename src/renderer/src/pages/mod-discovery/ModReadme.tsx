import React, { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import { ModVideoPlayer } from "@renderer/components/ModVideoPlayer";
import { PanelIndent } from "@renderer/components/MainPanel";
import { readmeCache } from "./ModCard";

const { shell } = window.require("electron");

export function resolveGithubAsset(src: string, githubUrl: string): string {
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const rawBase =
        githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") + "/main/";
    return rawBase + src.replace(/^\.\//, "");
}

export function ModReadme({ githubUrl }: { githubUrl: string }) {
    const [readme, setReadme] = useState<string>(() => readmeCache.get(githubUrl) ?? "");
    const [loading, setLoading] = useState(!readmeCache.has(githubUrl));

    const MarkdownImage = useMemo(
        () =>
            function MarkdownImage({ src, alt, ...props }: React.ImgHTMLAttributes<HTMLImageElement>) {
                const [loaded, setLoaded] = useState(false);
                if (!src) return null;
                return (
                    <>
                        {!loaded && <div className="mod-md-img-skeleton" />}
                        <img
                            className="mod-md-img"
                            style={loaded ? undefined : { display: "none" }}
                            draggable
                            {...props}
                            src={resolveGithubAsset(src, githubUrl)}
                            alt={alt}
                            onLoad={() => setLoaded(true)}
                        />
                    </>
                );
            },
        [githubUrl],
    );

    useEffect(() => {
        if (readmeCache.has(githubUrl)) return;

        const fetchReadme = async () => {
            try {
                const rawUrl =
                    githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") +
                    "/main/README.md";

                const response = await fetch(rawUrl);
                if (!response.ok) throw new Error("README not found");
                const text = await response.text();
                readmeCache.set(githubUrl, text);
                setReadme(text);
            } catch (e) {
                const fallback = "README could not be loaded.";
                readmeCache.set(githubUrl, fallback);
                setReadme(fallback);
            } finally {
                setLoading(false);
            }
        };

        fetchReadme();
    }, [githubUrl]);

    return (
        <PanelIndent>
            {loading ? (
                <div className="mod-readme-skeleton">
                    <div className="mod-readme-skeleton-heading" style={{ width: "45%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "95%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "88%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "92%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "65%" }} />
                    <div className="mod-readme-skeleton-block" />
                    <div className="mod-readme-skeleton-heading" style={{ width: "30%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "90%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "80%" }} />
                    <div className="mod-readme-skeleton-line" style={{ width: "55%" }} />
                </div>
            ) : (
            <div className="mod-readme-container">
                <ReactMarkdown
                    components={{
                        h1: ({ node, ...props }) => <h1 className="minecraft-seven mod-md-h1" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="minecraft-seven mod-md-h2" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="minecraft-seven mod-md-h3" {...props} />,
                        h4: ({ node, ...props }) => <h4 className="minecraft-seven mod-md-h4" {...props} />,
                        h5: ({ node, ...props }) => <h5 className="minecraft-seven mod-md-h5" {...props} />,
                        p: ({ node, ...props }) => <p className="minecraft-seven mod-md-p" {...props} />,
                        li: ({ node, ...props }) => <li className="minecraft-seven mod-md-li" {...props} />,
                        ol: ({ node, ...props }) => <ol className="mod-md-ol" {...props} />,
                        ul: ({ node, ...props }) => <ul className="mod-md-ul" {...props} />,
                        code: ({ node, ...props }) => <code className="minecraft-seven mod-md-code" {...props} />,
                        pre: ({ children }) => {
                            type CodeProps = { className?: string; children?: React.ReactNode };
                            const codeEl = (
                                Array.isArray(children) ? children[0] : children
                            ) as React.ReactElement<CodeProps>;
                            const lang = /language-(\w+)/.exec(codeEl?.props?.className ?? "")?.[1];
                            if (lang) {
                                return (
                                    <SyntaxHighlighter
                                        language={lang}
                                        style={{ ...vscDarkPlus, italic: { fontStyle: "normal" } }}
                                        customStyle={{
                                            margin: "8px 0",
                                            fontSize: "13px",
                                            borderRadius: "4px",
                                            fontStyle: "normal",
                                        }}
                                    >
                                        {String(codeEl.props.children ?? "").replace(/\n$/, "")}
                                    </SyntaxHighlighter>
                                );
                            }
                            return <pre className="mod-md-pre">{children}</pre>;
                        },
                        blockquote: ({ node, ...props }) => <blockquote className="mod-md-blockquote" {...props} />,
                        table: ({ node, ...props }) => <table className="minecraft-seven mod-md-table" {...props} />,
                        thead: ({ node, ...props }) => <thead className="mod-md-thead" {...props} />,
                        tr: ({ node, ...props }) => <tr className="mod-md-tr" {...props} />,
                        th: ({ node, ...props }) => <th className="minecraft-seven mod-md-th" {...props} />,
                        td: ({ node, ...props }) => <td className="minecraft-seven mod-md-td" {...props} />,
                        img: MarkdownImage,
                        video: props => <ModVideoPlayer {...props} />,
                        source: ({ src, type }: { src?: string; type?: string }) => (
                            <source type={type} src={src ? resolveGithubAsset(src, githubUrl) : undefined} />
                        ),
                        hr: ({ ...props }) => <hr className="mod-md-hr" {...props} />,
                        strong: ({ ...props }) => <strong className="minecraft-seven mod-md-strong" {...props} />,
                        em: ({ ...props }) => <em className="minecraft-seven mod-md-em" {...props} />,
                        del: ({ ...props }) => <del className="minecraft-seven mod-md-del" {...props} />,
                        a: ({ node, ...props }) => (
                            <a
                                {...props}
                                className="minecraft-seven mod-md-link"
                                onClick={e => {
                                    e.preventDefault();
                                    if (props.href) {
                                        shell.openExternal(props.href);
                                    }
                                }}
                            />
                        ),
                    }}
                    remarkPlugins={[remarkGfm]}
                    rehypePlugins={[rehypeRaw]}
                >
                    {readme}
                </ReactMarkdown>
            </div>
            )}
        </PanelIndent>
    );
}
