"""SaveManager — save slots, settings, and key remapping that survive a restart.

A game that cannot remember anything is a demo. This is the smallest persistence
layer that is actually safe to ship:

* **Somewhere sensible.** Saves go to the OS's per-user application data
  directory, not next to the .py file, which may be read-only once installed.
* **Atomic writes.** The data is written to a temporary file and then renamed
  over the target, so losing power mid-save costs you the new save rather than
  the old one. Losing a completed playthrough to a half-written file is the one
  bug players never forgive.
* **Versioned.** Every payload carries a schema ``version``, so a later build can
  migrate an old save instead of crashing on a missing key.

    saves = rf.SaveManager("MyGame")
    saves.write(1, {"level": 3, "hp": 12, "coins": 47})
    data = saves.read(1, default={"level": 1})
"""

from __future__ import annotations

import json
import os
import sys
import tempfile
from typing import Any

SCHEMA_KEY = "version"


def save_dir(app_name: str) -> str:
    """Per-user writable directory for ``app_name``, following OS convention."""
    if sys.platform == "win32":
        base = os.environ.get("APPDATA") or os.path.expanduser("~")
        return os.path.join(base, app_name)
    if sys.platform == "darwin":
        return os.path.join(os.path.expanduser("~/Library/Application Support"), app_name)
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, app_name)


def write_json_atomic(path: str, payload: dict) -> None:
    """Write ``payload`` to ``path`` so a crash cannot leave it half-written."""
    directory = os.path.dirname(os.path.abspath(path))
    os.makedirs(directory, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=directory, suffix=".tmp")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as fh:
            json.dump(payload, fh, indent=1, sort_keys=True)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp, path)       # atomic on POSIX and Windows
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


class SaveManager:
    def __init__(self, app_name: str = "RetroForge", *, directory: str | None = None,
                 version: int = 1) -> None:
        self.app_name = app_name
        self.directory = directory or save_dir(app_name)
        self.version = version

    # -- paths ----------------------------------------------------------------
    def slot_path(self, slot: int | str) -> str:
        return os.path.join(self.directory, f"save{slot}.json")

    @property
    def settings_path(self) -> str:
        return os.path.join(self.directory, "settings.json")

    # -- slots ----------------------------------------------------------------
    def exists(self, slot: int | str) -> bool:
        return os.path.isfile(self.slot_path(slot))

    def slots(self) -> list[str]:
        """Names of every existing save slot."""
        if not os.path.isdir(self.directory):
            return []
        out = []
        for name in sorted(os.listdir(self.directory)):
            if name.startswith("save") and name.endswith(".json"):
                out.append(name[len("save"):-len(".json")])
        return out

    def write(self, slot: int | str, data: dict) -> None:
        payload = dict(data)
        payload[SCHEMA_KEY] = self.version
        write_json_atomic(self.slot_path(slot), payload)

    def read(self, slot: int | str, default: dict | None = None) -> dict | None:
        """Load a slot, or ``default`` if it is missing or corrupt.

        A truncated or hand-edited save returns ``default`` rather than raising,
        so a bad file costs the player one slot instead of the whole game.
        """
        try:
            with open(self.slot_path(slot), encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return dict(default) if default is not None else None
        if not isinstance(data, dict):
            return dict(default) if default is not None else None
        return data

    def version_of(self, slot: int | str) -> int | None:
        data = self.read(slot)
        return None if data is None else int(data.get(SCHEMA_KEY, 0))

    def delete(self, slot: int | str) -> bool:
        try:
            os.unlink(self.slot_path(slot))
            return True
        except OSError:
            return False

    # -- settings -------------------------------------------------------------
    def write_settings(self, settings: dict) -> None:
        payload = dict(settings)
        payload[SCHEMA_KEY] = self.version
        write_json_atomic(self.settings_path, payload)

    def read_settings(self, default: dict | None = None) -> dict:
        try:
            with open(self.settings_path, encoding="utf-8") as fh:
                data = json.load(fh)
        except (OSError, json.JSONDecodeError):
            return dict(default) if default else {}
        return data if isinstance(data, dict) else (dict(default) if default else {})

    # -- key remapping --------------------------------------------------------
    def save_keymap(self, keymap: dict) -> None:
        """Persist an InputManager keymap ({keycode: Button})."""
        settings = self.read_settings()
        settings["keymap"] = {str(int(k)): int(v) for k, v in keymap.items()}
        self.write_settings(settings)

    def load_keymap(self) -> dict[int, Any] | None:
        """Restore a saved keymap, ready to hand to ``InputManager``."""
        from .input.input import Button

        raw = self.read_settings().get("keymap")
        if not isinstance(raw, dict):
            return None
        out: dict[int, Button] = {}
        for key, value in raw.items():
            try:
                out[int(key)] = Button(int(value))
            except (ValueError, TypeError):
                continue          # a stale binding should not break startup
        return out or None
