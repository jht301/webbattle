# Backend

The multiplayer / inventory / trade backend for NetBattle Arena lives in a
separate repository: **webbattle-server**.

It is a Node.js + `ws` + `node:sqlite` service that:

- verifies CrazyGames JWTs and mints session tokens,
- persists per-user tokens and chip inventory,
- brokers friend rooms and public matchmaking,
- runs authoritative chip-duel resolution (stock decrement + token rewards),
- stores pending trades.

## Wiring the client to a running backend

Edit [`src/config.js`](src/config.js) and set `SERVER_URL` to the public HTTPS
URL of your backend. Empty string means "no backend" — training and shop still
work (via CrazyGames Data SDK or localStorage), but the Multiplayer and Trade
scenes show a "not configured" message.

```js
window.NBA.config = {
    SERVER_URL: 'https://your-host.example.com',
    WS_URL: '',  // auto-derived from SERVER_URL if left empty
};
```

## Off-CrazyGames dev testing

When the client is loaded outside CrazyGames there is no real CG JWT. The
client falls back to packing `{userId, username}` as a base64 JSON "token"
and the server accepts it **only** when started with
`NBA_DEV_TRUST_TOKENS=1`. Never set that flag in production.

See the backend repo's README for setup, environment variables, and the
WebSocket protocol definition.
