# Multicam RCP for Companion 4

Version 1.1 (branch `companion-4`) brings the 2.0 line's features to Companion 4.1 and
later with classic buttons: it uses Multicam RCP's `1.0-preview` public integration API for
camera controls, user selection, routing, PTZ/scene/tracing presets, Follow and live JPEG
image feedbacks. It no longer connects to the retired `/ws-core`
Socket.IO interface.

See [configuration and limits](companion/HELP.md) and [LICENSE](LICENSE).

## Release lines

Two lines share one core and are published side by side; Companion installs the newest
version it can run.

| Branch        | Version | Module API | Companion     | Presets                                   |
| ------------- | ------- | ---------- | ------------- | ----------------------------------------- |
| `main`        | 2.x     | 2.1        | 5.1 and later | layered tiles, gauges, Stream Deck + page |
| `companion-4` | 1.x     | 1.13       | 4.1 and later | classic buttons                           |

Files directly in `src/` and `test-api.mjs` are the shared core and stay identical on both
branches. Each line owns `src/companion.ts` (the module API adapter the core imports
Companion's types from), `src/main.ts` (the entry), `src/presets/`, `test-presets.mjs`,
`package.json` and `companion/`. Change the core on one branch, then copy it across with
`tools/sync-core.sh <other checkout>`, build and test there, and commit on both.

## Development

Use Node 22.20+ and the pinned Yarn version (`corepack yarn`).

```sh
yarn install
yarn test
yarn lint
yarn package
```

`yarn dev` watches TypeScript sources. Load this directory through Companion's
module developer folder. `src/api.ts` is a standalone HTTP/WebSocket reference
client and has no dependency on Multicam's internal transports.
