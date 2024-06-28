const { BundleAnalyzerPlugin } = require('webpack-bundle-analyzer');

module.exports = function override(config, env) {
    // Set the target to 'electron-renderer'
    config.target = 'electron-renderer';

    // Do not resolve certain Node.js core modules
    config.resolve.fallback = {
        "fs": false,
        "tls": false,
        "net": false,
        "path": false,
        "zlib": false,
        "http": false,
        "https": false,
        "stream": false,
        "crypto": false,
        "child_process": false,
    };

    // Tree shaking and code splitting
    if (env === 'production') {
        config.optimization = {
            ...config.optimization,
            usedExports: true, // Enable tree shaking
            sideEffects: true, // Respect the sideEffects field in package.json
            splitChunks: {
                chunks: 'all',
                maxInitialRequests: Infinity,
                minSize: 0,
                cacheGroups: {
                    vendor: {
                        test: /[\\/]node_modules[\\/]/,
                        name(module) {
                            const packageName = module.context.match(/[\\/]node_modules[\\/](.*?)([\\/]|$)/)[1];
                            return `npm.${packageName.replace('@', '')}`;
                        },
                    },
                },
            },
        };

        // Minimize and remove source maps
        config.devtool = false; // Disable source maps
        config.plugins.push(
            new BundleAnalyzerPlugin({
              analyzerMode: 'static',
              openAnalyzer: true,
              reportFilename: 'bundle-report.html',
            })
        )
    }

    return config;
};
