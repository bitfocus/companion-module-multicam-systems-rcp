#!/usr/bin/env python3
"""Writes a Multicam RCP connection and a tracing demo page into Companion 5.1's DB.

Page 1 becomes TRACING: camera tiles, AUTO ON (speed 0 + recall a tracing preset on every
camera), AUTO OFF (recall a normal preset), record, stop, speed presets and a speed dial.
Edit CAMS for the project (uuid, label, 1-based position in the API's camera list).

Quit Companion first and back up db.sqlite, then:
  python3 tools/tracing-demo-page.py ~/Library/Application\ Support/companion/v5.1/db.sqlite
The connection row goes to `instances`, where Companion 5.1 keeps connections.
"""
import json
import secrets
import sqlite3
import string
import sys

DB = sys.argv[1]
ALPHABET = string.ascii_letters + string.digits + "_-"
CONN = "mcrcpTracingDemo01xyz"  # 21 chars like nanoid
LABEL = "multicam"
UPGRADE_INDEX = 1  # the module has two upgrade scripts (0, 1)

# Demo cameras (uuid, short name, 1-based index in the API's camera list for variables)
CAMS = [
    ("f5920092-9ffa-42fb-ae9d-99dd0aee1bbd", "Z CAM", 6),
    ("63fd6ecc-b631-4b2d-ab71-2722782ffd58", "CAM 2", 2),
    ("6c19c92f-8b3e-430c-99f8-0eaf8af062c8", "CAM 3", 3),
    ("02e39c58-ad0f-4997-a2c3-fa00f08bdbb3", "CAM 4", 4),
]
OVERVIEW_PRESET = 1  # normal PTZ preset recalled by AUTO OFF

AMBER, RED, GREEN, BLUE, GREY, DARK = 0xFBBF24, 0xDC2626, 0x16A34A, 0x2563EB, 0x3F3F46, 0x18181B
WHITE, BLACK = 0xFFFFFF, 0x000000


def nid(n=21):
    return "".join(secrets.choice(ALPHABET) for _ in range(n))


def v(value):
    return {"value": value, "isExpression": False}


def layers(text, bg=DARK, fg=WHITE, size=100):
    return [
        {"id": "canvas", "name": "Canvas", "usage": "auto", "type": "canvas",
         "decoration": v("default"), "showStatusIcons": v("default")},
        {"id": "box0", "name": "Background", "usage": "auto", "type": "box",
         "pinnedProperties": ["color"], "enabled": v(True), "opacity": v(100),
         "x": v(0), "y": v(0), "width": v(100), "height": v(100), "rotation": v(0),
         "color": v(bg), "cornerRadius": v(0), "borderWidth": v(0), "borderColor": v(0),
         "borderPosition": v("inside")},
        {"id": "text0", "name": "Text", "usage": "auto", "type": "text",
         "pinnedProperties": ["text", "fontsize", "fontsizeAllowShrink", "color", "halign", "valign"],
         "enabled": v(True), "opacity": v(100), "x": v(0), "y": v(0), "width": v(100),
         "height": v(100), "rotation": v(0), "text": v(text), "color": v(fg),
         "halign": v("center"), "valign": v("center"), "fontsize": v(size),
         "fontsizeAllowShrink": v(True), "font": v("companion-sans"), "weight": v("bold"),
         "styles": v([]), "outlineColor": v(0xFF000000)},
    ]


def action(definition, **options):
    return {"type": "action", "id": nid(), "definitionId": definition, "connectionId": CONN,
            "options": {k: v(val) for k, val in options.items()}, "upgradeIndex": UPGRADE_INDEX}


def feedback(definition, bg, fg=BLACK, **options):
    return {"type": "feedback", "id": nid(), "definitionId": definition, "connectionId": CONN,
            "options": {k: v(val) for k, val in options.items()}, "isInverted": v(False),
            "upgradeIndex": UPGRADE_INDEX,
            "styleOverrides": [
                {"overrideId": nid(), "elementId": "box0", "elementProperty": "color", "override": v(bg)},
                {"overrideId": nid(), "elementId": "text0", "elementProperty": "color", "override": v(fg)},
            ]}


def button(text, down=(), feedbacks=(), bg=DARK, fg=WHITE, size=100, rotate_left=None, rotate_right=None):
    action_sets = {"down": list(down), "up": []}
    rotary = rotate_left is not None or rotate_right is not None
    if rotary:
        action_sets["rotate_left"] = list(rotate_left or [])
        action_sets["rotate_right"] = list(rotate_right or [])
    return {
        "type": "button-layered",
        "style": {"layers": layers(text, bg, fg, size)},
        "options": {"stepProgression": "auto", "rotaryActions": rotary, "canModifyStyleInApis": False},
        "feedbacks": list(feedbacks),
        "steps": {"0": {"action_sets": action_sets, "options": {"runWhileHeld": []}}},
        "localVariables": [],
    }


def each(make):
    return [a for cam in CAMS for a in make(cam[0])]


def speed_set(value, cams=None):
    return [action("float_set", camera=c[0], property="tracing_speed", value=value) for c in (cams or CAMS)]


def auto_on(path, cams=None):
    cams = cams or CAMS
    return speed_set(0, cams) + [
        action("recall_preset", camera=c[0], preset=path, mode="tracing", user="") for c in cams]


def record(path, cams=None):
    return [action("store_preset", camera=c[0], preset=path, mode="tracing", user="") for c in (cams or CAMS)]


def step_speed(direction, cams=None):
    return [action("float_increase" if direction > 0 else "float_decrease", camera=c[0],
                   property="tracing_speed", step_size="big", user="") for c in (cams or CAMS)]


def status_fb(cam_uuid, state, bg, fg=BLACK, preset=0):
    return feedback("tracing_state", bg, fg, camera=cam_uuid, state=state, preset=preset)


lead = CAMS[0]
var = lambda cam_index, name: f"$({LABEL}:camera_{cam_index}_{name})"

grid = {}  # (row, col) -> model
# Row 0: camera status tiles, record path 1, stop all, speed readout / dial
for col, (uuid, name, index) in enumerate(CAMS, start=1):
    grid[(0, col)] = button(
        f"{name}\n{var(index, 'tracing_status')}\n{var(index, 'tracing_progress')}",
        down=[action("tracing_stop", camera=uuid)],
        feedbacks=[status_fb(uuid, "arriving", BLUE, WHITE), status_fb(uuid, "running", AMBER),
                   status_fb(uuid, "paused", GREEN, WHITE), status_fb(uuid, "recording", RED, WHITE)],
        bg=GREY, size=80)
grid[(0, 5)] = button("REC\nPATH 1", down=record(1), bg=GREY,
                      feedbacks=[status_fb(lead[0], "recording", RED, WHITE, preset=1)])
grid[(0, 6)] = button("STOP\nALL", down=each(lambda c: [action("tracing_stop", camera=c)]), bg=RED)
grid[(0, 7)] = button(f"SPEED\n{var(lead[2], 'tracing_speed')}x\n(dial)", bg=BLACK, size=90,
                      down=speed_set(0), rotate_left=step_speed(-1), rotate_right=step_speed(1))

# Row 1: auto on per start position, auto off, record paths 2 and 3, speed +
for col, path in enumerate((1, 2, 3), start=1):
    grid[(1, col)] = button(f"AUTO ON\nPATH {path}", down=auto_on(path), bg=GREEN,
                            feedbacks=[status_fb(lead[0], "playing", AMBER, BLACK, preset=path)])
grid[(1, 4)] = button(f"AUTO OFF\nPRESET {OVERVIEW_PRESET}",
                      down=each(lambda c: [action("recall_preset", camera=c, preset=OVERVIEW_PRESET,
                                                  mode="normal", user="")]), bg=BLUE)
grid[(1, 5)] = button("REC\nPATH 2", down=record(2), bg=GREY,
                      feedbacks=[status_fb(lead[0], "recording", RED, WHITE, preset=2)])
grid[(1, 6)] = button("REC\nPATH 3", down=record(3), bg=GREY,
                      feedbacks=[status_fb(lead[0], "recording", RED, WHITE, preset=3)])
grid[(1, 7)] = button("SPEED\n+0.1", down=step_speed(1), bg=BLACK)

# Row 2: speed presets, speed -
for col, speed in enumerate((0, 0.5, 0.8, 1.0, 1.2, 1.5), start=1):
    grid[(2, col)] = button("HOLD\n0" if speed == 0 else f"SPEED\n{speed}x", down=speed_set(speed),
                            bg=RED if speed == 0 else BLACK)
grid[(2, 7)] = button("SPEED\n-0.1", down=step_speed(-1), bg=BLACK)

# Row 3: the lead camera alone, for a single-camera test
only = [lead]
grid[(3, 1)] = button(f"{lead[1]}\nAUTO ON 1", down=auto_on(1, only), bg=GREEN,
                      feedbacks=[status_fb(lead[0], "playing", AMBER, BLACK, preset=1)])
grid[(3, 2)] = button(f"{lead[1]}\nREC 1", down=record(1, only), bg=GREY,
                      feedbacks=[status_fb(lead[0], "recording", RED, WHITE, preset=1)])
grid[(3, 3)] = button(f"{lead[1]}\nSTOP", down=[action("tracing_stop", camera=lead[0])], bg=RED)
grid[(3, 4)] = button(f"{lead[1]}\nSPEED 1x", down=speed_set(1.0, only), bg=BLACK)
grid[(3, 5)] = button(f"{lead[1]}\nPRESET {OVERVIEW_PRESET}",
                      down=[action("recall_preset", camera=lead[0], preset=OVERVIEW_PRESET, mode="normal", user="")],
                      bg=BLUE)

con = sqlite3.connect(DB)
cur = con.cursor()
connection = {
    "moduleInstanceType": "connection", "moduleId": "multicam-systems-rcp", "moduleVersionId": "dev",
    "updatePolicy": "stable", "sortOrder": 0, "label": LABEL, "isFirstInit": False,
    "config": {"connection": "local", "host": "127.0.0.1", "port": 5995, "tls": False,
               "reconnect": True, "debug_messages": False,
               "cloudUrl": "https://api.cloud.multicam.systems"},
    "secrets": {}, "lastUpgradeIndex": UPGRADE_INDEX, "enabled": True,
}
cur.execute("insert or replace into instances (id, value) values (?, ?)", (CONN, json.dumps(connection)))

page = json.loads(cur.execute("select value from pages where id = '1'").fetchone()[0])
# Keep the page navigation in column 0; drop any earlier demo controls on this page.
for row, cols in list(page["controls"].items()):
    for col, control_id in list(cols.items()):
        if col != "0":
            cur.execute("delete from controls where id = ?", (control_id,))
            del cols[col]
for (row, col), model in grid.items():
    control_id = f"bank:{nid()}"
    cur.execute("insert into controls (id, value) values (?, ?)", (control_id, json.dumps(model)))
    page["controls"].setdefault(str(row), {})[str(col)] = control_id
page["name"] = "TRACING"
cur.execute("update pages set value = ? where id = '1'", (json.dumps(page),))
con.commit()
print(f"connection {CONN}; {len(grid)} buttons on page 1")
