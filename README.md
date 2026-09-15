# Multicam RCP for Companion 5

The 2.0 beta uses Multicam RCP's `1.0-preview` public integration API. It includes
camera controls, user selection, routing, PTZ/scene presets, native gauges and
shared live JPEG image feedbacks. It no longer connects to the retired `/ws-core`
Socket.IO interface.

See [configuration and limits](companion/HELP.md) and [LICENSE](LICENSE).

## Development

Use Node 22.20+ or 26.5+ and the pinned Yarn version.

```sh
yarn install
yarn test
yarn lint
yarn package
```

`yarn dev` watches TypeScript sources. Load this directory through Companion's
module developer folder. `src/api.ts` is a standalone HTTP/WebSocket reference
client and has no dependency on Multicam's internal transports.

Saved action/feedback IDs and explicit host/port settings are retained on upgrade.
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
