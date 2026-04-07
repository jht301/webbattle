// ============================================================
// Auth — wraps CrazyGames User SDK. Falls back to local guest.
// Exposes:
//   init() -> Promise          Initialise SDK + load identity
//   isGuest() -> bool
//   getUsername() -> string
//   getToken() -> string|null  CG JWT, refreshed on demand
//   signIn() -> Promise        Show CG auth prompt
// ============================================================
(function () {
    let _user = null;     // { id, username, profilePictureUrl } or null
    let _token = null;
    let _tokenExpiresAt = 0;

    function sdk() {
        return (window.CrazyGames && window.CrazyGames.SDK) || null;
    }

    async function init() {
        const s = sdk();
        if (!s) {
            // Dev / non-CG: local guest with a stable random username.
            const stored = window.NBA.storage.getItem('guestName');
            if (stored) {
                _user = { id: 'guest:' + stored, username: stored };
            } else {
                const name = 'guest' + Math.floor(Math.random() * 9000 + 1000);
                window.NBA.storage.setItem('guestName', name);
                _user = { id: 'guest:' + name, username: name };
            }
            return;
        }
        try {
            if (s.init) await s.init();
        } catch (e) {
            console.warn('[auth] CG SDK init failed', e);
        }
        try {
            if (s.user && s.user.getUser) {
                const u = await s.user.getUser();
                if (u) _user = { id: u.username, username: u.username, profilePictureUrl: u.profilePictureUrl };
            }
        } catch (_) {}
        if (!_user) {
            _user = { id: 'guest', username: 'Guest' };
        }
    }

    function isGuest() {
        if (!_user) return true;
        if (_user.username === 'Guest') return true;
        return String(_user.id).startsWith('guest');
    }

    function getUsername() { return _user ? _user.username : 'Guest'; }

    async function getToken() {
        const s = sdk();
        if (!s || !s.user || !s.user.getUserToken) return null;
        if (_token && Date.now() < _tokenExpiresAt - 60_000) return _token;
        try {
            _token = await s.user.getUserToken();
            // CG tokens last ~1h; refresh 1 min before expiry
            _tokenExpiresAt = Date.now() + 55 * 60 * 1000;
            return _token;
        } catch (e) {
            console.warn('[auth] getUserToken failed', e);
            return null;
        }
    }

    async function signIn() {
        const s = sdk();
        if (!s || !s.user || !s.user.showAuthPrompt) {
            console.warn('[auth] No CG SDK; cannot prompt sign-in');
            return false;
        }
        try {
            const u = await s.user.showAuthPrompt();
            if (u) {
                _user = { id: u.username, username: u.username, profilePictureUrl: u.profilePictureUrl };
                _token = null; // force refresh
                return true;
            }
        } catch (e) {
            console.warn('[auth] showAuthPrompt failed', e);
        }
        return false;
    }

    window.NBA = window.NBA || {};
    window.NBA.auth = { init, isGuest, getUsername, getToken, signIn };
})();
