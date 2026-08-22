import ReactMarkdown, { Components, Options } from "react-markdown";
import rehypeRaw from "rehype-raw";
import rehypeSanitize, { defaultSchema } from "rehype-sanitize";
import remarkGfm from "remark-gfm";

import { log } from "@renderer/scripts/LauncherLog";

const { shell } = window.require("electron") as typeof import("electron");

/**
 * `rehypeRaw` turns the HTML embedded in a remote README into real nodes, so nothing between it
 * and the DOM may be trusted. Sanitising after it is what keeps a third-party README from
 * reaching a renderer that runs with Node integration.
 */
const rehypePlugins: Options["rehypePlugins"] = [rehypeRaw, [rehypeSanitize, defaultSchema]];

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
    pre: ({ node: _node, ...props }) => <pre {...props} className="mod-md-pre" />,
    blockquote: ({ node: _node, ...props }) => <blockquote {...props} className="mod-md-blockquote" />,
    table: ({ node: _node, ...props }) => <table {...props} className="minecraft-seven mod-md-table" />,
    thead: ({ node: _node, ...props }) => <thead {...props} className="mod-md-thead" />,
    tr: ({ node: _node, ...props }) => <tr {...props} className="mod-md-tr" />,
    th: ({ node: _node, ...props }) => <th {...props} className="minecraft-seven mod-md-th" />,
    td: ({ node: _node, ...props }) => <td {...props} className="minecraft-seven mod-md-td" />,
    img: ({ node: _node, ...props }) => (props.src ? <img {...props} className="mod-md-img" /> : null),
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

export function Markdown({ children }: { children: string }) {
    return (
        <ReactMarkdown
            components={components}
            remarkPlugins={[remarkGfm]}
            rehypePlugins={rehypePlugins}
        >
            {children}
        </ReactMarkdown>
    );
}
