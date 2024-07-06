declare global {
    interface Window {
        native: {
            path: path.PlatformPath;
            __dirname: string;
        },
        require: NodeRequire,
        env: NodeJS.ProcessEnv
    }
}