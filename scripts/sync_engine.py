"""Copy the forest engine from the Memory Forest add-on into engine/, base sceneries only.

    python3 scripts/sync_engine.py [path/to/anki_forest]

The Action never loads the add-on directly: it draws with the copy in engine/, so a change
in the add-on reaches people's profiles only when it is synced here and released. The
copy is the scripts every forest loads (catalog.SCRIPTS, in order) followed by the files
the sceneries in SCENERIES draw with, joined into one file. The scenery looks themselves
go to src/presets.json.

It copies the add-on as of its last commit, never work in progress there: commit in the
add-on first, then sync.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_ADDON = os.path.join(os.path.dirname(REPO), "anki-automator", "anki_forest")
# the sceneries the Action offers (the add-on's base presets), each with the length of its
# loop in seconds and its frame rate. A loop is as long as what crosses the scene needs to
# cross it at the add-on's own speed: the lanterns' sky lanterns take about a minute, and
# bamboo's river lanterns hand over to the next one in 10 seconds. Sceneries with nothing
# crossing keep a short loop, which keeps their files small. Birds are decided by the
# engine (daytime, calm weather, the past day's contributions), so any scene that has them
# loops in a minute instead (BIRD_LOOP in src/render.js).
SCENERIES = {
    "golden_lake": (4, 12),
    "misty_valley": (4, 12),
    "aurora": (4, 12),
    "lanterns": (60, 8),
    "bamboo": (10, 12),
    "synthwave": (4, 12),
}


def write_json(path: str, value) -> None:
    with open(path, "w", encoding="utf-8") as f:
        json.dump(value, f, indent=2)
        f.write("\n")


def committed_copy(addon: str, into: str) -> str:
    """The add-on's folder as of its repository's HEAD, unpacked under `into`."""
    def git(*args: str, cwd: str = addon) -> str:
        return subprocess.run(["git", *args], cwd=cwd, capture_output=True, check=True).stdout
    top, prefix = git("rev-parse", "--show-toplevel").decode().strip(), git("rev-parse", "--show-prefix").decode().strip()
    # (a tree path like HEAD:anki_forest is read from the top of the repository)
    tar = git("archive", "--format=tar", f"HEAD:{prefix.rstrip('/')}" if prefix else "HEAD", cwd=top)
    subprocess.run(["tar", "-x", "-C", into], input=tar, check=True)
    return into


def main() -> None:
    source_dir = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ADDON)
    with tempfile.TemporaryDirectory() as tmp:
        sync(source_dir, committed_copy(source_dir, tmp))


def sync(source_dir: str, addon: str) -> None:
    sys.path.insert(0, addon)
    import catalog
    import presets

    with open(os.path.join(addon, "editions.json"), encoding="utf-8") as f:
        base_envs = set(json.load(f)["base"]["envs"])
    by_key = {p.key: p for p in presets.FOREST_PRESETS}
    looks, scenery_files = {}, []  # looks: each scenery's preset, for src/presets.json
    for key in SCENERIES:
        cfg = dict(by_key[key].values())
        if cfg["environment"] not in base_envs:
            sys.exit(f"{key} draws with {cfg['environment']}, which is not in the base edition")
        looks[key] = {"environment": cfg["environment"], "landscape": cfg["landscape"],
                      "landmark": cfg.get("landmark", "none"), "weather": cfg["weather"], "time": cfg["time_of_day"],
                      "loop": SCENERIES[key][0], "fps": SCENERIES[key][1]}
        for kind, name in (("envs", cfg["environment"]), ("landscapes", cfg["landscape"]), ("landmarks", cfg.get("landmark"))):
            rel = f"{kind}/{name}.js"
            if name and os.path.exists(os.path.join(catalog.WEB, rel)) and rel not in scenery_files:
                scenery_files.append(rel)

    files = list(catalog.SCRIPTS) + scenery_files
    parts = []
    for rel in files:
        with open(os.path.join(catalog.WEB, rel), encoding="utf-8") as f:
            parts.append(f"/* ---- {rel} ---- */\n{f.read()}")
    os.makedirs(os.path.join(REPO, "engine"), exist_ok=True)
    with open(os.path.join(REPO, "engine", "forest-engine.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    write_json(os.path.join(REPO, "src", "presets.json"), looks)

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=source_dir, capture_output=True, text=True, check=True).stdout.strip()
    source = {"addon_commit": commit, "synced": dt.datetime.now(dt.timezone.utc).date().isoformat(),
              "files": files}
    write_json(os.path.join(REPO, "engine", "SOURCE.json"), source)
    print(f"engine/forest-engine.txt: {len(parts)} files from {source['addon_commit']}; sceneries: {', '.join(SCENERIES)}")


if __name__ == "__main__":
    main()
