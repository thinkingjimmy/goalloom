# link-preview/

> Parent: [main](../README.md). Public URL metadata; never workspace mutations.

- `service.ts`: bounded queue, in-flight deduplication, session cancellation and offline cache orchestration.
- `transport.ts`: credential-free HTTP(S), public-address validation, pinned DNS, redirect and response limits.
- `providers.ts`: isolated Electron session for fixed HTTPS X/YouTube endpoints and their known image paths, with no redirects or credentials.
- `metadata.ts`: inert OG/title parsing, YouTube oEmbed and X public embed metadata; raster image validation.
- `cache.ts`: bounded device-local JSON cache, independent of workspace backups and history.

## Failure scenarios recorded before implementation

- Invalid schemes, credentials, localhost/private/reserved IPs, mixed public/private DNS, DNS rebinding, unsafe redirects and unsafe image destinations must never reach those destinations.
- Redirect loops, stalled DNS/HTTP, oversized bodies, compressed payloads, malformed HTML/JSON and unreadable images must resolve to a bounded unavailable/text-only result.
- Repeated URLs must share work; bursts must respect finite concurrency and queue budgets. Session release cancels active/queued work and prevents late cache insertion.
- Missing OG tags, X login/deleted/private posts, unavailable public embed endpoints and YouTube failures must not invent titles or covers.
- Corrupt cache files, interrupted writes, disk permission errors and cache capacity limits must not affect task creation or reads. Cached previews remain usable offline.
- The renderer receives only bounded text and validated raster data URLs, never fetched HTML, scripts, remote image URLs, cookies or credentials.
- URL query strings may be part of the public resource identity; task text, workspace IDs and unrelated data must never be included in requests or logs.

## Limits and lifecycle

The service API is `new LinkPreviewService(cacheDirectory)`, `get(url)` and `releaseSession()`. Cache storage belongs outside the workspace. Session release keeps persistent cache but clears memory and aborts work. Metadata availability depends on the destination; X syndication is a best-effort public endpoint, not an authenticated API guarantee.

Network work is limited to three active jobs plus 48 queued jobs, 18 seconds per job, three redirects, and 1 MiB per response. Only default HTTP(S) ports are fetched; credentials, non-public DNS answers, downgrade redirects and non-public sockets are rejected. PNG/JPEG/WebP images have checked signatures and dimensions (8192 px per side, 20 megapixels total); missing images preserve useful text.

Cache files use SHA-256 of the canonical URL without its fragment. JSON contains `{version: 1, fetchedAt, preview}`. Successful entries expire for refresh after seven days (15 minutes without a cover), but stale results return immediately and refresh in the background. Transient failures remain only in memory for 30 seconds. Memory is limited to 64 entries / 16 MiB; disk to 128 entries / 64 MiB. Writes are atomic and private to the device.

Serving an expired disk record gives it only a 30-second refresh retry window, never a new full freshness period. A failed refresh preserves the usable cached content while allowing a later visible request to try again.

Generic page/image DNS must resolve to public routable addresses. Networks that replace arbitrary hosts with private/reserved proxy addresses receive the unavailable fallback for those pages. X/YouTube adapters instead use exact trusted HTTPS metadata endpoints and CDN image paths through an isolated in-memory Electron session, retaining system network/proxy support and normal TLS checks. That transport omits credentials, refuses every redirect, bypasses custom protocol handlers and bounds decoded response bytes; it is never selected for arbitrary page metadata or arbitrary OG images.

[PROTOCOL]: Update this header when making changes, then check README.md.
