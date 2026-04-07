// ============================================================
// Storage — wraps CrazyGames Data SDK with localStorage fallback.
// All keys are namespaced under "nba.".
// ============================================================
(function () {
    const PREFIX = 'nba.';

    function cgData() {
        // CrazyGames v3 SDK exposes data on CrazyGames.SDK.data
        if (typeof window === 'undefined') return null;
        const sdk = window.CrazyGames && window.CrazyGames.SDK;
        if (sdk && sdk.data) return sdk.data;
        return null;
    }

    function getItem(key) {
        const k = PREFIX + key;
        try {
            const cg = cgData();
            if (cg && cg.getItem) return cg.getItem(k);
            return window.localStorage.getItem(k);
        } catch (e) {
            console.warn('[storage] getItem failed', e);
            return null;
        }
    }

    function setItem(key, value) {
        const k = PREFIX + key;
        try {
            const cg = cgData();
            if (cg && cg.setItem) { cg.setItem(k, value); return; }
            window.localStorage.setItem(k, value);
        } catch (e) {
            console.warn('[storage] setItem failed', e);
        }
    }

    function removeItem(key) {
        const k = PREFIX + key;
        try {
            const cg = cgData();
            if (cg && cg.removeItem) { cg.removeItem(k); return; }
            window.localStorage.removeItem(k);
        } catch (e) {
            console.warn('[storage] removeItem failed', e);
        }
    }

    function getJSON(key, fallback) {
        const raw = getItem(key);
        if (raw == null) return fallback;
        try { return JSON.parse(raw); } catch (_) { return fallback; }
    }

    function setJSON(key, obj) {
        setItem(key, JSON.stringify(obj));
    }

    window.NBA = window.NBA || {};
    window.NBA.storage = { getItem, setItem, removeItem, getJSON, setJSON };
})();
