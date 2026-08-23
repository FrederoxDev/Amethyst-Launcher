import { useMemo, useState } from "react";
import ReactMarkdown, { Components, Options } from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import vscDarkPlus from "react-syntax-highlighter/dist/esm/styles/prism/vsc-dark-plus";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { ModVideoPlayer } from "@renderer/components/ModVideoPlayer";
import { log } from "@renderer/scripts/LauncherLog";

const { shell } = window.require("electron") as typeof import("electron");

/**
 * `rehypeRaw` turns the HTML embedded in a remote README into real nodes, so nothing between it
 * and the DOM may be trusted. Sanitising after it is what keeps a third-party README from
 * reaching a renderer that runs with Node integration.
 */
/**
 * A README may embed a clip, so <video>/<source> survive sanitising. Only the playback
 * attributes are allowed through - no event handlers, and nothing that can name a script.
 */
const sanitizeSchema = {
    ...defaultSchema,
    tagNames: [...(defaultSchema.tagNames ?? []), "video", "source"],
    attributes: {
        ...defaultSchema.attributes,
        video: ["src", "poster", "controls", "loop", "muted", "playsInline", "width", "height"],
        source: ["src", "type"],
    },
};

const rehypePlugins: Options["rehypePlugins"] = [rehypeRaw, [rehypeSanitize, sanitizeSchema]];

/**
 * READMEs address their own images with repository-relative paths, which mean nothing once the
 * markdown is rendered outside GitHub. Anything already absolute is left untouched.
 */
function resolveGithubAsset(src: string, githubUrl: string): string {
    if (src.startsWith("http://") || src.startsWith("https://")) return src;
    const rawBase =
        githubUrl.replace("https://github.com/", "https://raw.githubusercontent.com/").replace(/\/$/, "") + "/main/";
    return rawBase + src.replace(/^\.\//, "");
}

/** Holds the layout with a placeholder so a slow image does not make the README jump. */
function MarkdownImage({
    src,
    alt,
    assetBaseUrl,
    ...props
}: React.ImgHTMLAttributes<HTMLImageElement> & { assetBaseUrl?: string }) {
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
                src={assetBaseUrl ? resolveGithubAsset(src, assetBaseUrl) : src}
                alt={alt}
                onLoad={() => setLoaded(true)}
            />
        </>
    );
}

/** Fenced blocks that name a language are highlighted; everything else stays a plain <pre>. */
function MarkdownPre({ children }: { children?: React.ReactNode }) {
    type CodeProps = { className?: string; children?: React.ReactNode };
    const codeEl = (Array.isArray(children) ? children[0] : children) as React.ReactElement<CodeProps>;
    const lang = /language-(\w+)/.exec(codeEl?.props?.className ?? "")?.[1];
    if (!lang) return <pre className="mod-md-pre">{children}</pre>;
    return (
        <SyntaxHighlighter
            language={lang}
            style={{ ...vscDarkPlus, italic: { fontStyle: "normal" } }}
            customStyle={{ margin: "8px 0", fontSize: "13px", borderRadius: "4px", fontStyle: "normal" }}
        >
            {String(codeEl.props.children ?? "").replace(/\n$/, "")}
        </SyntaxHighlighter>
    );
}

function openExternally(href: string): void {
    let url: URL;
    try {
        url = new URL(href);
    } catch {
        log("Markdown", `Ignoring the link "${href}": it is not an absolute URL`);
        return;
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
        log("Markdown", `Ignoring the link "${href}": ${url.protocol} links are not opened`);
        return;
    }

    shell.openExternal(url.href);
}

const components: Components = {
    h1: ({ node: _node, ...props }) => <h1 {...props} className="minecraft-seven mod-md-h1" />,
    h2: ({ node: _node, ...props }) => <h2 {...props} className="minecraft-seven mod-md-h2" />,
    h3: ({ node: _node, ...props }) => <h3 {...props} className="minecraft-seven mod-md-h3" />,
    p: ({ node: _node, ...props }) => <p {...props} className="minecraft-seven mod-md-p" />,
    li: ({ node: _node, ...props }) => <li {...props} className="minecraft-seven mod-md-li" />,
    ol: ({ node: _node, ...props }) => <ol {...props} className="mod-md-ol" />,
    ul: ({ node: _node, ...props }) => <ul {...props} className="mod-md-ul" />,
    code: ({ node: _node, ...props }) => <code {...props} className="minecraft-seven mod-md-code" />,

    blockquote: ({ node: _node, ...props }) => <blockquote {...props} className="mod-md-blockquote" />,
    table: ({ node: _node, ...props }) => <table {...props} className="minecraft-seven mod-md-table" />,
    thead: ({ node: _node, ...props }) => <thead {...props} className="mod-md-thead" />,
    tr: ({ node: _node, ...props }) => <tr {...props} className="mod-md-tr" />,
    th: ({ node: _node, ...props }) => <th {...props} className="minecraft-seven mod-md-th" />,
    td: ({ node: _node, ...props }) => <td {...props} className="minecraft-seven mod-md-td" />,

    a: ({ node: _node, ...props }) => (
        <a
            {...props}
            className="minecraft-seven mod-md-link"
            onClick={e => {
                e.preventDefault();
                if (props.href) openExternally(props.href);
            }}
        />
    ),
};

export function Markdown({ children, assetBaseUrl }: { children: string; assetBaseUrl?: string }) {
    // Rebuilt only when the base URL changes, so typing elsewhere does not remount every image.
    const allComponents: Components = useMemo(
        () => ({
            ...components,
            pre: MarkdownPre,
            img: ({ node: _node, ...props }) => <MarkdownImage {...props} assetBaseUrl={assetBaseUrl} />,
            video: ({ node: _node, src, ...props }) => (
                <ModVideoPlayer {...props} src={src && assetBaseUrl ? resolveGithubAsset(src, assetBaseUrl) : src} />
            ),
            source: ({ node: _node, src, ...props }) => (
                <source {...props} src={src && assetBaseUrl ? resolveGithubAsset(src, assetBaseUrl) : src} />
            ),
        }),
        [assetBaseUrl]
    );

    return (
        <ReactMarkdown components={allComponents} remarkPlugins={[remarkGfm]} rehypePlugins={rehypePlugins}>
            {children}
        </ReactMarkdown>
    );
}
