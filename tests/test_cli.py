"""The retroforge command line."""

from __future__ import annotations

import json
import os
import subprocess
import sys

import pytest

from retroforge.cli import main

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _run(capsys, *argv: str) -> tuple[int, str]:
    code = main(list(argv))
    return code, capsys.readouterr().out


# -- info -------------------------------------------------------------------

def test_info_lists_what_the_engine_offers(capsys):
    code, out = _run(capsys, "info")
    assert code == 0
    assert "RES_SNES" in out and "256x224" in out
    assert "SELECT" in out, "buttons should be listed"
    assert "out_bounce" in out, "easings should be listed"
    assert "up_right" in out, "slope shapes should be listed"


def test_info_json_is_machine_readable(capsys):
    code, out = _run(capsys, "info", "--json")
    assert code == 0
    data = json.loads(out)
    assert data["physics_hz"] == 60
    assert data["resolutions"]["RES_SNES"] == [256, 224]
    assert "A" in data["buttons"] and "START" in data["buttons"]
    assert "linear" in data["easings"]
    assert "EntityRegistry" in data["exports"]
    assert data["version"]


# -- examples ---------------------------------------------------------------

def test_examples_lists_the_bundled_demos(capsys):
    code, out = _run(capsys, "examples")
    assert code == 0
    for name in ("coin_rush", "platformer", "topdown", "mode7_racer"):
        assert name in out


# -- check ------------------------------------------------------------------

def _level(name: str) -> str:
    return os.path.join(ROOT, "examples", name, "assets",
                        "level.json" if name == "coin_rush" else "level1.json")


@pytest.mark.skipif(not os.path.exists(_level("coin_rush")),
                    reason="example assets not generated")
def test_check_reads_a_real_level(capsys):
    code, out = _run(capsys, "check", _level("coin_rush"))
    assert code == 0
    assert "tiles" in out
    assert "coin" in out, "object types should be reported"
    assert "Looks fine" in out


@pytest.mark.skipif(not os.path.exists(_level("coin_rush")),
                    reason="example assets not generated")
def test_check_json_reports_structure(capsys):
    code, out = _run(capsys, "check", _level("coin_rush"), "--json")
    assert code == 0
    data = json.loads(out)
    assert data["ok"] is True
    assert data["problems"] == []
    assert data["solid_tiles"] > 0
    assert data["object_types"]["coin"] > 0


@pytest.mark.skipif(not os.path.exists(_level("platformer")),
                    reason="example assets not generated")
def test_check_sees_slopes_and_ladders(capsys):
    code, out = _run(capsys, "check", _level("platformer"), "--json")
    assert code == 0
    data = json.loads(out)
    assert data["slope_tiles"] > 0
    assert data["ladder_tiles"] > 0


def test_check_reports_a_missing_file(capsys):
    code, _ = _run(capsys, "check", "/nope/absent.json")
    assert code == 1


def test_check_flags_an_empty_level(tmp_path, capsys):
    level = tmp_path / "empty.json"
    level.write_text(json.dumps({
        "width": 4, "height": 4, "tilewidth": 16, "tileheight": 16,
        "infinite": False,
        "layers": [{"type": "tilelayer", "name": "main", "width": 4,
                    "height": 4, "data": [0] * 16}],
        "tilesets": [{"firstgid": 1, "source": "t.png"}],
    }))
    code, out = _run(capsys, "check", str(level))
    assert code == 1
    assert "empty" in out or "solid" in out


def test_check_flags_untyped_objects(tmp_path, capsys):
    level = tmp_path / "untyped.json"
    level.write_text(json.dumps({
        "width": 4, "height": 4, "tilewidth": 16, "tileheight": 16,
        "infinite": False,
        "layers": [
            {"type": "tilelayer", "name": "main", "width": 4, "height": 4,
             "data": [1] * 16},
            {"type": "objectgroup", "name": "spawns",
             "objects": [{"id": 1, "name": "here", "x": 8, "y": 8,
                          "width": 0, "height": 0}]},
        ],
        "tilesets": [{"firstgid": 1, "source": "t.png",
                      "tiles": [{"id": 0, "properties": [
                          {"name": "solid", "type": "bool", "value": True}]}]}],
    }))
    code, out = _run(capsys, "check", str(level), "--json")
    data = json.loads(out)
    assert code == 1
    assert any("no type" in p for p in data["problems"])


def test_check_handles_a_malformed_file(tmp_path, capsys):
    bad = tmp_path / "bad.json"
    bad.write_text("{not json at all")
    code, out = _run(capsys, "check", str(bad), "--json")
    assert code == 1
    assert json.loads(out)["ok"] is False


# -- new --------------------------------------------------------------------

def test_new_scaffolds_a_runnable_project(tmp_path, capsys):
    target = tmp_path / "mygame"
    code, _ = _run(capsys, "new", "My Game", "-d", str(target))
    assert code == 0

    for name in ("main.py", "test_game.py", "README.md"):
        assert (target / name).exists(), name
    assert (target / "assets").is_dir()

    source = (target / "main.py").read_text()
    assert "My Game" in source
    assert "class MainScene" in source
    compile(source, "main.py", "exec")          # must be valid Python

    tests = (target / "test_game.py").read_text()
    compile(tests, "test_game.py", "exec")


def test_new_refuses_to_overwrite_a_non_empty_directory(tmp_path, capsys):
    target = tmp_path / "taken"
    target.mkdir()
    (target / "important.txt").write_text("do not clobber me")

    code, _ = _run(capsys, "new", "X", "-d", str(target))
    assert code == 1
    assert (target / "important.txt").read_text() == "do not clobber me"


def test_new_defaults_the_directory_to_the_name(tmp_path, capsys, monkeypatch):
    monkeypatch.chdir(tmp_path)
    code, _ = _run(capsys, "new", "sidescroller")
    assert code == 0
    assert (tmp_path / "sidescroller" / "main.py").exists()


def test_the_scaffolded_game_actually_runs(tmp_path, capsys):
    """The template is only worth shipping if its own tests pass."""
    target = tmp_path / "generated"
    _run(capsys, "new", "Generated", "-d", str(target))

    env = {
        **os.environ,
        "SDL_VIDEODRIVER": "dummy",
        "SDL_AUDIODRIVER": "dummy",
        "PYTHONPATH": os.pathsep.join([ROOT, str(target)]),
    }
    result = subprocess.run(
        [sys.executable, "-m", "pytest", "-q", str(target / "test_game.py")],
        capture_output=True, text=True, env=env, cwd=str(target), timeout=180,
    )
    assert result.returncode == 0, result.stdout + result.stderr


# -- run --------------------------------------------------------------------

def test_run_rejects_an_unknown_target(capsys):
    code, _ = _run(capsys, "run", "not-an-example")
    assert code == 1


# -- top level --------------------------------------------------------------

def test_bare_invocation_prints_help(capsys):
    code, out = _run(capsys)
    assert code == 0
    assert "usage" in out.lower()


def test_module_entry_point_works():
    result = subprocess.run(
        [sys.executable, "-m", "retroforge", "info", "--json"],
        capture_output=True, text=True, timeout=120,
        env={**os.environ, "SDL_VIDEODRIVER": "dummy",
             "SDL_AUDIODRIVER": "dummy", "PYTHONPATH": ROOT},
    )
    assert result.returncode == 0, result.stderr
    assert json.loads(result.stdout)["physics_hz"] == 60
