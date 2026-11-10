# Multicam RCP

## Connect

This beta is for **Companion 4.1 and later** and needs Multicam RCP beta 261028 or newer
(integration API `1.0-preview`). The token screen in RCP comes in the beta after 261028. On Companion 5.1 and later, use version 2 of this module: it adds gauges,
layered tiles and a Stream Deck + page.

- **Multicam RCP on this network:** RCP servers announcing themselves on the local network (Bonjour). Pick one, or **Manual** to type the address. A discovered server is reached over HTTP at the port it announces.
- **Target IP / Port:** with Manual, your RCP server, default `127.0.0.1:5994`. Existing saved ports are preserved.
- **Integration API token:** leave empty when Companion runs on the same computer as RCP. For Companion on another computer, create a token in RCP under **Production Toolbox → Companion → Access**, on the computer that runs RCP, and paste it here. Tick all four access options for every feature. Companion stores it as a secret.
- **Use HTTPS / WSS:** with Manual, enable for a server providing HTTPS; use that server's HTTPS port.
- **Auto Reconnect:** retry after five seconds when disconnected.

Tokens expire and can be revoked. Changing the active RCP project requires a token
for that project. Old Socket.IO-only servers are not supported by this beta.

## Controls and presets

Controls use discovered camera IDs and available properties. Numeric increment/decrement
runs against current server state, with the server's small/normal/big steps. User camera
selection, routing, and PTZ/scene preset recall/store/clear use the same owners as the RCP app.

**Continuous movement is unavailable in the API preview.** Requests are
rejected explicitly. PTZ preset recall remains available.

**Tracing** (recorded PTZ paths, RCP with tracing in the integration API): use the preset
actions in Tracing mode. _Store_ starts recording the camera's path into the preset and a
second _Store_ saves it; store on several cameras with one button to record them together,
so they play back in step. _Recall_ plays the path from its start (a repeated recall
starts it again, it never stops it). The camera's **Tracing speed** control sets the pace
(1 = as recorded, 0 holds the head). **Tracing: Speed (Several Cameras)** sets one speed on
every chosen camera in one pass, so cameras recorded together stay in step: put its _Up_ and
_Down_ modes on a rotary encoder for a speed lever, or _Set_ 0 before the recall so every
camera waits at its start. **Tracing: Stop** ends a playback; recalling a normal PTZ preset ends it too. The
**Tracing: Camera State** feedback and the `camera_N_tracing_status`, `_preset`,
`_progress` and `_remaining` variables show what each camera does. Camera readback is separate
from command admission; accepting a command does not prove that hardware completed it.

**Follow** (3D Tracing, RCP with Follow in the integration API): **Follow: Start** points a
camera where a leader camera's centre of picture meets a surface of the site (its surface ID
from the RCP's 3D Tracing page), or the level ground at a height. Zoom can stay with the
operator, keep a frame width in metres at the target, or match the leader's picture. Start it
again to change it; **Follow: Stop**, or any other move of the follower, ends it. Both
cameras need a position on the site. The **Follow: Camera State** feedback and the
`camera_N_follow_status` and `_follow_leader` variables show it.

Preset numbers are the ones the RCP shows: Preset 1 on a camera is preset 1 here (up to 999).

Values follow the camera's own definition. A control the camera reports shows a dash until
it has reported. A control with named steps (gain in dB, shutter speeds) shows the step's
name on its value button and in a `camera_N_<control>_text` variable; the plain variable keeps the
number. When the camera does not take a control now (knee level while knee is on Auto), a
press is refused with the camera's reason in the log, and the **Property: Not Available Now**
feedback can grey the button.

Buttons made with 1.0 keep their actions and feedbacks. **User: Select Camera** and **User:
Clear Camera Selection** now select a choice on the user's controller switcher in Multicam (its
choice for that camera, or its choice with no camera), so the user needs a switcher there; without
one, or without a matching choice, the press is logged as a warning. **Controller: Select Choice**
is the general form. Presets are classic buttons in a category
per camera, user and router, with a header per control family. Every numeric control has
**+**, **−** and a **value / rotary** button: the value button shows the live value and
carries the encoder's rotate actions, so on a Stream Deck + it sits on an encoder. Enum
controls work the same way with **‹** and **›**. A disconnected value shows empty.

The RCP's **Setup → Companion buttons** page chooses which cameras and routers get presets
and the colour per control group. Changes reach the preset list within a second; placed
buttons keep working.

## Live video

The **Live video** category provides one preset per discovered video source: the picture
fills the button with the source name underneath, drawn by the **Live video image on the
button** feedback. JPEGs are not saved into button configuration on each frame.

Defaults: **160×90, 10 fps, JPEG quality 65**. Edit the feedback to choose
16–640 × 16–360 pixels, 1–15 fps and quality 20–90. Higher resolutions and rates consume
more bandwidth and processing. Matching source/profile feedbacks share one subscription;
the backend can share capture/decoding with other consumers. The final feedback being
disabled or removed releases demand. Hidden-page behavior follows Companion's feedback lifecycle.

Images clear on disconnect or after two seconds without a new frame. Keep RCP and
Companion clocks synchronized; images older than two seconds are discarded. Capture/source
changes reconnect after a short delay. The first API preview accepts configured source
IDs, not camera monitoring aliases or route-following crops.

## Cloud connection preview

Select **Multicam Cloud (preview)** and enter the cloud API HTTPS origin, integration
client ID/secret, project ID and exact target instance ID. Use a project integration
client created through `/control/v1/clients` with `monitor` and the required `control`/
`routing` scopes. General organization API credentials are a separate credential type.
The module exchanges the secret for short-lived tokens and renews them in memory.
Revocation or loss of the selected instance disconnects the module; it never switches
targets automatically. Discovery and controls use the same API as local RCP.
Cloud live-video presets are unavailable until the cloud media transport is implemented.
Requires the matching cloud/RCP integration preview rollout; local fixture tests do not
establish production cloud readiness.
