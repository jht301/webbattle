// ============================================================
// WebSocket client for the NetBattle backend.
// Handles auth handshake, message routing, and reconnect.
// ============================================================
(function () {
    const listeners = {};   // type -> Set<fn>
    let ws = null;
    let session = null;     // server session token (NOT the CG token)
    let connecting = false;

    function on(type, fn) {
        if (!listeners[type]) listeners[type] = new Set();
        listeners[type].add(fn);
        return () => off(type, fn);
    }
    function off(type, fn) {
        if (listeners[type]) listeners[type].delete(fn);
    }
    function emit(type, msg) {
        if (listeners[type]) for (const fn of listeners[type]) {
            try { fn(msg); } catch (e) { console.warn(e); }
        }
        if (listeners['*']) for (const fn of listeners['*']) {
            try { fn(msg); } catch (e) { console.warn(e); }
        }
    }

    // Exchange a CrazyGames JWT for a server session token.
    async function ensureSession() {
        if (session) return session;
        const cfg = window.NBA.config;
        if (!cfg || !cfg.SERVER_URL) throw new Error('No SERVER_URL configured');
        const cgToken = await window.NBA.auth.getToken();
        if (!cgToken) {
            // Dev fallback: pack a guest identity into a base64 JSON token
            // (only accepted when server has NBA_DEV_TRUST_TOKENS=1)
            const username = window.NBA.auth.getUsername();
            const fake = btoa(JSON.stringify({ userId: 'guest:' + username, username }))
                .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
            const r = await fetch(cfg.SERVER_URL + '/auth/verify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token: fake }),
            });
            if (!r.ok) throw new Error('auth/verify failed: ' + r.status);
            const j = await r.json();
            session = j.sessionToken;
            return session;
        }
        const r = await fetch(cfg.SERVER_URL + '/auth/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: cgToken }),
        });
        if (!r.ok) throw new Error('auth/verify failed: ' + r.status);
        const j = await r.json();
        session = j.sessionToken;
        return session;
    }

    async function connect() {
        if (ws && ws.readyState === 1) return ws;
        if (connecting) {
            // wait briefly
            await new Promise(r => setTimeout(r, 100));
            return ws;
        }
        connecting = true;
        try {
            const tok = await ensureSession();
            const cfg = window.NBA.config;
            const wsUrl = cfg.WS_URL + '?token=' + encodeURIComponent(tok);
            await new Promise((resolve, reject) => {
                ws = new WebSocket(wsUrl);
                ws.onopen = () => resolve();
                ws.onerror = (e) => reject(e);
                ws.onmessage = (ev) => {
                    let msg;
                    try { msg = JSON.parse(ev.data); } catch (_) { return; }
                    emit(msg.type, msg);
                };
                ws.onclose = () => {
                    emit('close', {});
                    ws = null;
                };
            });
        } finally {
            connecting = false;
        }
        return ws;
    }

    function send(msg) {
        if (!ws || ws.readyState !== 1) {
            console.warn('[ws] not connected, dropping', msg);
            return;
        }
        ws.send(JSON.stringify(msg));
    }

    function disconnect() {
        if (ws) try { ws.close(); } catch (_) {}
        ws = null;
    }

    function isConnected() { return !!(ws && ws.readyState === 1); }

    // ---- HTTP helpers (server REST endpoints) ----
    async function fetchInventory() {
        const cfg = window.NBA.config;
        if (!cfg || !cfg.SERVER_URL) return null;
        const tok = await ensureSession();
        const r = await fetch(cfg.SERVER_URL + '/inventory', {
            headers: { Authorization: 'Bearer ' + tok }
        });
        if (!r.ok) return null;
        return await r.json();
    }

    async function syncInventory(payload) {
        const cfg = window.NBA.config;
        if (!cfg || !cfg.SERVER_URL) return null;
        const tok = await ensureSession();
        const r = await fetch(cfg.SERVER_URL + '/inventory/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + tok },
            body: JSON.stringify(payload),
        });
        if (!r.ok) return null;
        return await r.json();
    }

    window.NBA = window.NBA || {};
    window.NBA.net = {
        on, off, connect, send, disconnect, isConnected,
        fetchInventory, syncInventory,
    };
})();
