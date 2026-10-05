"""Copy the forest engine from the Memory Forest add-on into engine/, base sceneries only.

    python3 scripts/sync_engine.py [path/to/anki_forest]

The Action never loads the add-on directly: it draws with the copy in engine/, so a change
in the add-on reaches people's profiles only when it is synced here and released. The
copy is the scripts every forest loads (catalog.SCRIPTS, in order) followed by the files
the sceneries in SCENERIES draw with, joined into one file. The scenery looks themselves
go to src/presets.json.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
DEFAULT_ADDON = os.path.join(os.path.dirname(REPO), "anki-automator", "anki_forest")
# the sceneries the Action offers: the add-on's base presets
SCENERIES = ("golden_lake", "misty_valley", "aurora", "lanterns", "bamboo", "synthwave")


def main() -> None:
    addon = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else DEFAULT_ADDON)
    sys.path.insert(0, addon)
    import catalog
    import presets

    with open(os.path.join(addon, "editions.json"), encoding="utf-8") as f:
        base_envs = set(json.load(f)["base"]["envs"])
    by_key = {p.key: p for p in presets.FOREST_PRESETS}
    looks, scenery_files = {}, []
    for key in SCENERIES:
        cfg = dict(by_key[key].values())
        if cfg["environment"] not in base_envs:
            sys.exit(f"{key} draws with {cfg['environment']}, which is not in the base edition")
        looks[key] = {"environment": cfg["environment"], "landscape": cfg["landscape"],
                      "landmark": cfg.get("landmark", "none"), "weather": cfg["weather"], "time": cfg["time_of_day"]}
        for kind, name in (("envs", cfg["environment"]), ("landscapes", cfg["landscape"]), ("landmarks", cfg.get("landmark"))):
            rel = f"{kind}/{name}.js"
            if name and os.path.exists(os.path.join(catalog.WEB, rel)) and rel not in scenery_files:
                scenery_files.append(rel)

    parts = []
    for rel in list(catalog.SCRIPTS) + scenery_files:
        with open(os.path.join(catalog.WEB, rel), encoding="utf-8") as f:
            parts.append(f"/* ---- {rel} ---- */\n{f.read()}")
    os.makedirs(os.path.join(REPO, "engine"), exist_ok=True)
    with open(os.path.join(REPO, "engine", "forest-engine.txt"), "w", encoding="utf-8") as f:
        f.write("\n".join(parts))
    with open(os.path.join(REPO, "src", "presets.json"), "w", encoding="utf-8") as f:
        json.dump(looks, f, indent=2)
        f.write("\n")

    commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=addon, capture_output=True, text=True).stdout.strip()
    dirty = bool(subprocess.run(["git", "status", "--porcelain", "--", "web"], cwd=addon, capture_output=True, text=True).stdout.strip())
    source = {"addon_commit": commit + ("+changes" if dirty else ""), "synced": dt.date.today().isoformat(),
              "files": list(catalog.SCRIPTS) + scenery_files}
    with open(os.path.join(REPO, "engine", "SOURCE.json"), "w", encoding="utf-8") as f:
        json.dump(source, f, indent=2)
        f.write("\n")
    print(f"engine/forest-engine.txt: {len(parts)} files from {source['addon_commit']}; sceneries: {', '.join(SCENERIES)}")


if __name__ == "__main__":
    main()
