# Multicam RCP

## Connect

This beta requires Companion 5 and an RCP build exposing API `1.0-preview`.

- **Target IP / Port:** your RCP server, default `127.0.0.1:5994`. Existing saved ports are preserved.
- **Integration API token:** a project-scoped token issued by your RCP administrator. Use `monitor`, `control`, `routing` and `images` scopes for all features. Companion stores it as a secret.
- **Use HTTPS / WSS:** enable for a server providing HTTPS; use that server's HTTPS port.
- **Auto Reconnect:** retry after five seconds when disconnected.

Tokens expire and can be revoked. Changing the active RCP project requires a token
for that project. Old Socket.IO-only servers are not supported by this beta.

## Controls and presets

Controls use discovered camera IDs and available properties. Numeric increment/decrement
runs against current server state, with the server's small/normal/big steps. User camera
selection, routing, and PTZ/scene preset recall/store/clear use the same owners as the RCP app.

**Continuous movement and tracing are unavailable in the API preview.** Requests are
rejected explicitly. PTZ preset recall remains available. Camera readback is separate
from command admission; accepting a command does not prove that hardware completed it.

Preset actions use human-facing numbers 1–1000, mapped to API slots 0–999.

Existing action and feedback IDs are retained. Presets are Companion 5 layered buttons,
arranged in sections per camera, user and router with a group per control family.
Numeric controls show a ring gauge with the live value; **Rotary** presets go on a
Stream Deck + LCD strip and turn the encoder below it. **Control gauges** are read-only
levels for any numeric control. A disconnected value shows a dash.

The look and the offered devices are chosen on the RCP under **Setup → Companion
buttons**: ring, bar or plain gauges, colour per control group / one colour / monochrome,
Companion's top bar on or off, and which cameras and routers get presets. Changes reach
the preset list within a second; placed buttons keep working.

## Stream Deck +

The **Stream Deck +: <user>** section is one page that follows the operator. Row 1 holds
the user's camera choices (live image where the RCP links a video source; press to
select). Row 2 picks a control bank: Gain, Gamma, Lift or Exposure. The four LCD
segments show the bank's four controls of the selected camera as ring gauges with the
active step size underneath, and the encoder under each segment turns that control by
the user's step size. Pushing an encoder cycles the step size (fine, normal, coarse) and
the gauges follow. Bank and step size live in this Companion connection per RCP user.

Text size, gauge style and colours come from the RCP's Setup → Companion buttons page.

## Live video

The **Live video · 16:9** section provides one preset per discovered video source. Each
uses the whole key width, preserves 16:9 and leaves space for its label. Its image is a
local value feedback; JPEGs are not saved into button configuration on each frame.

Defaults: **160×90, 10 fps, JPEG quality 65**. Edit the Live video image feedback to choose
16–640 × 16–360 pixels, 1–15 fps and quality 20–90. Higher resolutions and rates consume
more bandwidth and processing. Matching source/profile feedbacks share one subscription;
the backend can share capture/decoding with other consumers. The final feedback being
disabled or removed releases demand. Hidden-page behavior follows Companion's feedback lifecycle.

Images clear on disconnect or after two seconds without a new frame. Keep RCP and
Companion clocks synchronized; images older than two seconds are discarded. Capture/source
changes reconnect after a short delay. The first API preview accepts configured source
IDs, not camera monitoring aliases or route-following crops.

Local acceptance on Companion 5 rendered about 10 fps for one animated native test
source at 160×90. This is not a maximum supported source count, a real-camera benchmark
or a new physical Stream Deck throughput measurement.

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
