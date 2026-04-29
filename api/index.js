export const config = { runtime: "edge" };

// ---------------------------------------------------------------------------
// Bootstrap: resolve upstream origin once per isolate lifetime.
// Reading env at module scope avoids repeated lookups on hot paths.
// ---------------------------------------------------------------------------
const UPSTREAM = (process.env.CONTENT_API_ORIGIN || "").replace(/\/$/, "");

// Optional shared secret — set RELAY_TOKEN in Vercel env vars to require it.
// Leave unset to run without authentication (not recommended in production).
const ACCESS_TOKEN = process.env.RELAY_TOKEN || "";

// ---------------------------------------------------------------------------
// Headers that must not be forwarded to the upstream service.
// Includes standard hop-by-hop headers and platform-injected metadata.
// ---------------------------------------------------------------------------
const BLOCKED_HEADERS = new Set([
  "host",
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "forwarded",
  "x-forwarded-host",
  "x-forwarded-proto",
  "x-forwarded-port",
]);

// Paths that are handled locally and never forwarded upstream.
const LOCAL_PATHS = new Set(["/", "/health", "/status"]);

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
export default async function handler(req) {
  const url = new URL(req.url);

  // ── Serve the "coming soon" landing page for root and reserved paths ──────
  if (req.method === "GET" && LOCAL_PATHS.has(url.pathname)) {
    if (url.pathname === "/health" || url.pathname === "/status") {
      // Simple liveness probe — returns JSON so monitoring tools can parse it.
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    // Serve the landing page for root "/".
    return new Response(LANDING_PAGE_HTML, {
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "cache-control": "public, max-age=300",
      },
    });
  }

  // ── Guard: upstream origin must be configured ─────────────────────────────
  if (!UPSTREAM) {
    return new Response("Service Unavailable", { status: 503 });
  }

  // ── Optional token-based access control ───────────────────────────────────
  // Clients must pass the token as a Bearer value in the Authorization header.
  if (ACCESS_TOKEN) {
    const auth = req.headers.get("authorization") || "";
    if (auth.replace("Bearer ", "").trim() !== ACCESS_TOKEN) {
      return new Response("Unauthorized", { status: 401 });
    }
  }

  try {
    // ── Build upstream URL ─────────────────────────────────────────────────
    // Extract path+query cheaply: skip "https://" (8 chars) then find first "/".
    const pathIndex = req.url.indexOf("/", 8);
    const upstreamUrl =
      pathIndex === -1
        ? UPSTREAM + "/"
        : UPSTREAM + req.url.slice(pathIndex);

    // ── Filter and forward request headers ────────────────────────────────
    const forwardHeaders = new Headers();
    let clientAddress = null;

    for (const [key, value] of req.headers) {
      // Drop hop-by-hop and platform-injected headers.
      if (BLOCKED_HEADERS.has(key)) continue;
      // Drop all Vercel-internal telemetry headers.
      if (key.startsWith("x-vercel-")) continue;

      // Collect the real client IP; will be forwarded as x-forwarded-for.
      if (key === "x-real-ip") {
        clientAddress = value;
        continue;
      }
      if (key === "x-forwarded-for") {
        if (!clientAddress) clientAddress = value;
        continue;
      }

      forwardHeaders.set(key, value);
    }

    // Attach normalised client address so the upstream can log the real IP.
    if (clientAddress) forwardHeaders.set("x-forwarded-for", clientAddress);

    // ── Proxy the request, streaming body in both directions ──────────────
    // GET and HEAD carry no body; everything else streams req.body directly.
    const method = req.method;
    const bodyPayload =
      method !== "GET" && method !== "HEAD" ? req.body : undefined;

    return await fetch(upstreamUrl, {
      method,
      headers: forwardHeaders,
      body: bodyPayload,
      // "half" duplex lets us write the request body while reading the
      // response body concurrently — required for streaming protocols.
      duplex: "half",
      // Preserve 3xx responses as-is; chasing redirects would break framing.
      redirect: "manual",
    });
  } catch (err) {
    // Log server-side for debugging; return a generic error to the client.
    console.error("[proxy] upstream error:", err?.message ?? err);
    return new Response("Bad Gateway", { status: 502 });
  }
}

// ---------------------------------------------------------------------------
// Landing page HTML — served for GET / to make the deployment look like a
// normal website to casual visitors and automated scanners.
// ---------------------------------------------------------------------------
const LANDING_PAGE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Nordvik Books — Opening Soon</title>
  <meta name="description" content="An independent bookshop for curious minds. Nordvik Books opens its doors soon." />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=DM+Mono:wght@300;400&display=swap" rel="stylesheet" />
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg:       #0e0c0a;
      --surface:  #181410;
      --amber:    #d4843a;
      --rust:     #a6441a;
      --cream:    #e8dcc8;
      --muted:    #6b5f50;
      --line:     rgba(212,132,58,0.18);
    }

    html, body { height: 100%; background: var(--bg); color: var(--cream); font-family: 'DM Mono', monospace; overflow: hidden; }

    /* Noise texture */
    body::after {
      content: '';
      position: fixed;
      inset: 0;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.06'/%3E%3C/svg%3E");
      background-size: 200px;
      pointer-events: none;
      z-index: 100;
    }

    .page {
      display: grid;
      grid-template-rows: auto 1fr auto;
      height: 100vh;
      padding: 2.5rem 3rem;
    }

    /* ── Top bar ── */
    .topbar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid var(--line);
      padding-bottom: 1.2rem;
      animation: fade 1s ease both;
    }
    .logo {
      font-family: 'Playfair Display', serif;
      font-size: 1.05rem;
      font-weight: 700;
      letter-spacing: 0.04em;
      color: var(--cream);
    }
    .logo span { color: var(--amber); }
    .tag {
      font-size: 0.6rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--muted);
    }

    /* ── Centre ── */
    .centre {
      display: flex;
      flex-direction: column;
      justify-content: center;
      gap: 0;
      padding: 3rem 0;
    }

    .label {
      font-size: 0.62rem;
      letter-spacing: 0.4em;
      text-transform: uppercase;
      color: var(--amber);
      margin-bottom: 1.8rem;
      animation: slide 1s cubic-bezier(0.22,1,0.36,1) 0.1s both;
    }

    h1 {
      font-family: 'Playfair Display', serif;
      font-weight: 400;
      font-size: clamp(3rem, 9vw, 7.5rem);
      line-height: 0.92;
      color: var(--cream);
      animation: slide 1s cubic-bezier(0.22,1,0.36,1) 0.2s both;
    }
    h1 em {
      font-style: italic;
      color: var(--amber);
      display: block;
    }

    .rule {
      width: 100%;
      height: 1px;
      background: var(--line);
      margin: 2.8rem 0;
      animation: expand 1.2s ease 0.5s both;
      transform-origin: left;
      transform: scaleX(0);
    }

    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 3rem;
      animation: fade 1s ease 0.8s both;
    }

    .desc {
      font-size: 0.82rem;
      line-height: 1.85;
      color: var(--muted);
      max-width: 38ch;
    }
    .desc strong { color: var(--cream); font-weight: 400; }

    .notify {
      display: flex;
      flex-direction: column;
      gap: 0.7rem;
      justify-content: flex-end;
    }
    .notify-label {
      font-size: 0.6rem;
      letter-spacing: 0.3em;
      text-transform: uppercase;
      color: var(--muted);
    }
    .input-row {
      display: flex;
    }
    .notify input {
      background: transparent;
      border: 1px solid var(--muted);
      border-right: none;
      padding: 0.7rem 1rem;
      font-family: 'DM Mono', monospace;
      font-size: 0.75rem;
      color: var(--cream);
      outline: none;
      flex: 1;
      transition: border-color 0.3s;
    }
    .notify input::placeholder { color: var(--muted); }
    .notify input:focus { border-color: var(--amber); }
    .notify button {
      background: var(--amber);
      border: 1px solid var(--amber);
      color: var(--bg);
      padding: 0.7rem 1.2rem;
      font-family: 'DM Mono', monospace;
      font-size: 0.65rem;
      letter-spacing: 0.15em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background 0.3s;
      white-space: nowrap;
    }
    .notify button:hover { background: var(--rust); border-color: var(--rust); color: var(--cream); }

    /* ── Bottom bar ── */
    .bottombar {
      border-top: 1px solid var(--line);
      padding-top: 1.2rem;
      display: flex;
      justify-content: space-between;
      align-items: center;
      animation: fade 1s ease 1.2s both;
    }
    .coords {
      font-size: 0.6rem;
      letter-spacing: 0.2em;
      color: var(--muted);
    }
    .counter {
      font-size: 0.6rem;
      letter-spacing: 0.15em;
      color: var(--muted);
    }
    .counter span { color: var(--amber); font-size: 0.75rem; }

    /* Decorative book-spine lines */
    .spines {
      position: fixed;
      right: 0;
      top: 0;
      bottom: 0;
      width: 3px;
      display: flex;
      flex-direction: column;
      gap: 0;
      z-index: 1;
    }
    .spine { flex: 1; }
    .spine:nth-child(odd)  { background: rgba(212,132,58,0.12); }
    .spine:nth-child(even) { background: rgba(212,132,58,0.04); }

    @keyframes fade  { from { opacity: 0 } to { opacity: 1 } }
    @keyframes slide { from { opacity: 0; transform: translateY(20px) } to { opacity: 1; transform: translateY(0) } }
    @keyframes expand { to { transform: scaleX(1) } }
  </style>
</head>
<body>
  <div class="spines">
    <div class="spine"></div><div class="spine"></div><div class="spine"></div>
    <div class="spine"></div><div class="spine"></div><div class="spine"></div>
    <div class="spine"></div><div class="spine"></div><div class="spine"></div>
    <div class="spine"></div><div class="spine"></div><div class="spine"></div>
  </div>

  <div class="page">
    <header class="topbar">
      <div class="logo">Nordvik <span>&</span> Books</div>
      <div class="tag">Independent Bookshop</div>
    </header>

    <main class="centre">
      <p class="label">Opening Soon — 2025</p>
      <h1>A place for<em>slow reading.</em></h1>
      <div class="rule"></div>
      <div class="row">
        <p class="desc">
          We're building something <strong>unhurried</strong> — a carefully curated
          shop for readers who believe a good book deserves a good home.
          Fiction, essays, poetry, and the things in between.
        </p>
        <div class="notify">
          <p class="notify-label">Be first to know</p>
          <div class="input-row">
            <input type="email" placeholder="your@email.com" />
            <button>Notify</button>
          </div>
        </div>
      </div>
    </main>

    <footer class="bottombar">
      <div class="coords">59°54'N &nbsp;10°44'E &nbsp;·&nbsp; Oslo</div>
      <div class="counter">Est. <span>2025</span></div>
    </footer>
  </div>
</body>
</html>`;
