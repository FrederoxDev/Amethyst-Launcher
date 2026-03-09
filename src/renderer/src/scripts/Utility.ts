const { clearTimeout } = window.require("timers") as typeof import("timers");

export function fetchWithTimeout(url: string, options: RequestInit = {}, timeout: number = 5000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(`Timeout reached! (timeout = ${timeout}ms)`), timeout);
    return fetch(url, { ...options, signal: controller.signal })
        .finally(() => clearTimeout(timer));
}