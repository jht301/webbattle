// ============================================================
// Inventory — tokens + chip ownership (unlocked + MP stock).
// Persisted via window.NBA.storage. Account-synced when running on
// CrazyGames; localStorage otherwise.
// ============================================================
(function () {
    const KEY = 'inventory';

    // Defaults: starter loadout matches plan (Cannon + Recover30 unlocked).
    function makeDefaultInventory() {
        const chips = {};
        for (const name of window.NBA.CHIP_NAMES) {
            chips[name] = { unlocked: false, stock: 0 };
        }
        chips.Cannon.unlocked = true;
        chips.Recover30.unlocked = true;
        return { tokens: 0, chips };
    }

    let state = null;

    // Chip pricing — used by ShopScene + buy guards
    const PRICES = {
        Cannon:    { unlock: 0,   stock: 5 },
        Recover30: { unlock: 0,   stock: 8 },
        Sword:     { unlock: 50,  stock: 10 },
        Shockwave: { unlock: 75,  stock: 15 },
        Spreader:  { unlock: 100, stock: 20 },
        AreaSteal: { unlock: 150, stock: 30 },
    };

    function load() {
        const stored = window.NBA.storage.getJSON(KEY, null);
        if (!stored || !stored.chips) {
            state = makeDefaultInventory();
            save();
            return;
        }
        // Migrate / fill in any newly added chips since last save
        const def = makeDefaultInventory();
        for (const name of Object.keys(def.chips)) {
            if (!stored.chips[name]) stored.chips[name] = def.chips[name];
        }
        if (typeof stored.tokens !== 'number') stored.tokens = 0;
        state = stored;
    }

    function save() {
        if (!state) return;
        window.NBA.storage.setJSON(KEY, state);
    }

    function getTokens() { return state ? state.tokens : 0; }

    function addTokens(n) {
        if (!state) load();
        state.tokens = Math.max(0, state.tokens + n);
        save();
        return state.tokens;
    }

    function spendTokens(n) {
        if (!state) load();
        if (state.tokens < n) return false;
        state.tokens -= n;
        save();
        return true;
    }

    function isUnlocked(name) {
        return !!(state && state.chips[name] && state.chips[name].unlocked);
    }

    function getStock(name) {
        return (state && state.chips[name]) ? state.chips[name].stock : 0;
    }

    function unlockChip(name) {
        if (!state) load();
        const price = PRICES[name];
        if (!price) return { ok: false, reason: 'unknown chip' };
        if (state.chips[name].unlocked) return { ok: false, reason: 'already unlocked' };
        if (state.tokens < price.unlock) return { ok: false, reason: 'not enough tokens' };
        state.tokens -= price.unlock;
        state.chips[name].unlocked = true;
        save();
        return { ok: true };
    }

    function buyStock(name, qty) {
        if (!state) load();
        const price = PRICES[name];
        if (!price) return { ok: false, reason: 'unknown chip' };
        if (!state.chips[name].unlocked) return { ok: false, reason: 'not unlocked' };
        const cost = price.stock * qty;
        if (state.tokens < cost) return { ok: false, reason: 'not enough tokens' };
        state.tokens -= cost;
        state.chips[name].stock += qty;
        save();
        return { ok: true, newStock: state.chips[name].stock };
    }

    function consumeStock(name, qty) {
        if (!state) load();
        const c = state.chips[name];
        if (!c) return false;
        c.stock = Math.max(0, c.stock - qty);
        save();
        return true;
    }

    // All chip names the player has unlocked — used as the training pool.
    function getTrainingChips() {
        if (!state) load();
        return Object.keys(state.chips).filter(n => state.chips[n].unlocked);
    }

    // Chip names usable in MP — must be unlocked AND have stock>0.
    function getMpChips() {
        if (!state) load();
        return Object.keys(state.chips).filter(n => state.chips[n].unlocked && state.chips[n].stock > 0);
    }

    // Replace local state from a server-authoritative payload (after MP match).
    function applyServerState(serverState) {
        if (!serverState) return;
        if (typeof serverState.tokens === 'number') state.tokens = serverState.tokens;
        if (serverState.chips) {
            for (const name of Object.keys(serverState.chips)) {
                if (state.chips[name]) {
                    state.chips[name].unlocked = !!serverState.chips[name].unlocked;
                    state.chips[name].stock = serverState.chips[name].stock | 0;
                }
            }
        }
        save();
    }

    function snapshot() {
        if (!state) load();
        return JSON.parse(JSON.stringify(state));
    }

    window.NBA = window.NBA || {};
    window.NBA.inventory = {
        load, save, snapshot,
        getTokens, addTokens, spendTokens,
        isUnlocked, getStock,
        unlockChip, buyStock, consumeStock,
        getTrainingChips, getMpChips,
        applyServerState,
        PRICES,
    };
})();
