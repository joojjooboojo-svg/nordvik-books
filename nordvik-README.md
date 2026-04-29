# Nordvik & Books

Coming soon page and content delivery layer for **Nordvik & Books** —
an independent bookshop based in Oslo.

The project is a single Vercel Edge Function that:

- Serves a **"Opening Soon" landing page** at `/` while the shop is being built.
- Exposes `/health` and `/status` for uptime monitoring.
- Forwards all other requests to the configured `CONTENT_API_ORIGIN` backend.

---

## Project Layout

```
.
├── api/index.js   # Edge function: landing page + content API proxy
├── package.json   # Project metadata (no runtime deps)
├── vercel.json    # Routes all paths → /api/index
└── README.md
```

---

## Environment Variables

| Name                 | Example                            | Description                                     |
| -------------------- | ---------------------------------- | ----------------------------------------------- |
| `CONTENT_API_ORIGIN` | `https://api.internal.example.com` | Origin URL of the private content API backend.  |
| `RELAY_TOKEN`        | `supersecrettoken`                 | (Optional) Bearer token for access control.     |

Set these in **Vercel Dashboard → Project → Settings → Environment Variables**.

---

## Deployment

```bash
git clone <repo>
cd nordvik-books
vercel --prod
```

---

## Endpoints

| Path         | Behaviour                                         |
| ------------ | ------------------------------------------------- |
| `GET /`      | Returns the "Opening Soon" landing page (HTML).   |
| `GET /health`| Returns `{"ok":true}` — liveness probe.           |
| `GET /status`| Alias for `/health`.                              |
| `*`          | Proxied transparently to `CONTENT_API_ORIGIN`.    |

---

## License

MIT.
