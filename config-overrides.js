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

    return config;
}
  