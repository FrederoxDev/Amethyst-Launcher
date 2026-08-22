const globalWindow = window as unknown as Window & { require: NodeRequire };
globalWindow.require = require;
