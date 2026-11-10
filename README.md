# Multicam RCP for Companion 5

The 2.0 beta uses Multicam RCP's `1.0-preview` public integration API. It includes
camera controls, user selection, routing, PTZ/scene presets, native gauges and
shared live JPEG image feedbacks. It no longer connects to the retired `/ws-core`
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

Use Node 26 and the pinned Yarn version.

```sh
yarn install
yarn test
yarn lint
yarn package
```

`yarn dev` watches TypeScript sources. Load this directory through Companion's
module developer folder. `src/api.ts` is a standalone HTTP/WebSocket reference
client and has no dependency on Multicam's internal transports.

### Button design gallery

`yarn design:gallery` renders every preset through a running Companion (the
dev build, admin on port 8000, with this module connected to an RCP) into
`tools/design-gallery/out/index.html`. Each preset is placed on a scratch page,
drawn at 288 px with live variables and feedbacks, then removed again, so the
page shows exactly what an operator gets on a Stream Deck. `--label` names a
pass so several live states sit side by side, `--filter` limits the run to
matching preset ids or names, `--mode preset` uses Companion's preset preview
instead of a placed button. Serve the output directory with any static server
to browse it. The tile builders live in `src/presets/design.ts`; every preset in `src/presets/` is
composed from them.
The RCP's Setup → Companion buttons page (`state.presentation` in the API) selects the
gauge theme, accent mode, top bar and which cameras/routers get presets; the tiles read
it through `applyPresentation()`.

Saved actions, feedbacks and explicit host/port settings carry over from 1.0. **User: Select
Camera** and **User: Clear Camera Selection** now act through the user's controller switcher in
Multicam: they pick that switcher's choice for the camera (or its choice with no camera), and log
a warning when the user has no switcher or no such choice.
A newly issued API token is required. This beta is not a release for older Electron
servers. Companion and Central Control partner acceptance should precede a stable API commitment.

## Cloud connection preview

Select **Multicam Cloud (preview)** and enter the cloud API HTTPS origin, integration
client ID/secret, project ID and exact target instance ID. Use a project integration
client created through `/control/v1/clients` with `monitor` and the required `control`/
`routing` scopes. General organization API credentials are a separate credential type.
The module exchanges the secret for short-lived tokens and renews them in memory.
Revocation or loss of the selected instance disconnects the module; it never switches
targets automatically. Discovery, controls and gauges use the same API as local RCP.
Cloud live-video presets are unavailable until the cloud media transport is implemented.
Requires the matching cloud/RCP integration preview rollout; local fixture tests do not
establish production cloud readiness.

### Controller Switchers (2.0.0-beta.3)

Use **Controller: Select Choice** or the generated **Controller choices** presets to
select configured camera, vision, audio and Companion assignments, including nested
studio choices. Feedback shows the effective choice imposed by a parent switcher.
Selections use the current assignment generation; a conflicting edit requires fresh
state and a new operator selection. No routing or mixer scene is recalled.

Configure switchers in Multicam first. Controller choices replace the 1.0 automatically
generated per-camera user buttons; saved **User: Select Camera** / **User: Clear Camera
Selection** buttons keep working through the user's own switcher (see above). Gauges and live video presets remain available.
