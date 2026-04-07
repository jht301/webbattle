// Build-time config. Override on the test server by editing this file
// before deploying. Empty string disables the backend (offline / dev mode).
(function () {
    window.NBA = window.NBA || {};
    window.NBA.config = {
        // Base URL of the backend (no trailing slash). Empty = no backend.
        SERVER_URL: '',
        // WebSocket URL. Derived from SERVER_URL if empty.
        WS_URL: '',
    };
    // Auto-derive WS URL if SERVER_URL is set.
    const c = window.NBA.config;
    if (c.SERVER_URL && !c.WS_URL) {
        c.WS_URL = c.SERVER_URL.replace(/^http/, 'ws') + '/ws';
    }
})();
