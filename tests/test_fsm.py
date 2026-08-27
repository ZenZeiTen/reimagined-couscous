"""StateMachine: callbacks, transitions, and timing."""

from __future__ import annotations

import pytest

from retroforge.fsm import StateMachine

DT = 1 / 60


def test_initial_state_is_entered_on_first_update():
    log: list[str] = []
    fsm = StateMachine("idle")
    fsm.state("idle", enter=lambda: log.append("enter"))
    assert fsm.current is None, "not entered until the first update"
    fsm.update(DT)
    assert fsm.current == "idle"
    assert log == ["enter"]


def test_change_runs_exit_then_enter_in_order():
    log: list[str] = []
    fsm = StateMachine()
    fsm.state("a", enter=lambda: log.append("enter a"),
              exit=lambda: log.append("exit a"))
    fsm.state("b", enter=lambda: log.append("enter b"))
    fsm.change("a")
    fsm.change("b")
    assert log == ["enter a", "exit a", "enter b"]


def test_changing_to_the_current_state_is_a_no_op():
    log: list[str] = []
    fsm = StateMachine()
    fsm.state("a", enter=lambda: log.append("enter"))
    fsm.change("a")
    fsm.change("a")
    assert log == ["enter"]


def test_force_re_enters_the_current_state():
    log: list[str] = []
    fsm = StateMachine()
    fsm.state("a", enter=lambda: log.append("enter"),
              exit=lambda: log.append("exit"))
    fsm.change("a")
    fsm.change("a", force=True)
    assert log == ["enter", "exit", "enter"]


def test_unknown_state_raises():
    fsm = StateMachine()
    with pytest.raises(KeyError, match="nope"):
        fsm.change("nope")


def test_update_runs_the_current_states_body():
    ticks: list[float] = []
    fsm = StateMachine("run")
    fsm.state("run", update=ticks.append)
    for _ in range(3):
        fsm.update(DT)
    assert len(ticks) == 3
    assert ticks[0] == pytest.approx(DT)


def test_a_zero_argument_update_callback_also_works():
    """Not every state body wants the delta."""
    calls = []
    fsm = StateMachine("idle")
    fsm.state("idle", update=lambda: calls.append(1))
    fsm.update(DT)
    fsm.update(DT)
    assert calls == [1, 1]


def test_a_typeerror_inside_a_callback_is_not_swallowed():
    def broken(dt):
        raise TypeError("something genuinely wrong")

    fsm = StateMachine("bad")
    fsm.state("bad", update=broken)
    with pytest.raises(TypeError, match="genuinely wrong"):
        fsm.update(DT)


def test_time_in_state_accumulates_and_resets():
    fsm = StateMachine("a")
    fsm.state("a").state("b")
    for _ in range(30):
        fsm.update(DT)
    assert fsm.time_in_state == pytest.approx(0.5, abs=0.02)
    fsm.change("b")
    assert fsm.time_in_state == 0.0


def test_a_guarded_transition_fires():
    ready = False
    fsm = StateMachine("wait")
    fsm.state("wait").state("go")
    fsm.on("wait", "go", lambda: ready)

    fsm.update(DT)
    assert fsm.current == "wait"
    ready = True
    fsm.update(DT)
    assert fsm.current == "go"


def test_a_transition_from_anywhere_interrupts_any_state():
    hurt = False
    fsm = StateMachine("patrol")
    fsm.state("patrol").state("chase").state("stagger")
    fsm.on(None, "stagger", lambda: hurt)

    fsm.update(DT)
    fsm.change("chase")
    hurt = True
    fsm.update(DT)
    assert fsm.current == "stagger"


def test_transitions_are_checked_in_definition_order():
    fsm = StateMachine("start")
    fsm.state("start").state("first").state("second")
    fsm.on("start", "first", lambda: True)
    fsm.on("start", "second", lambda: True)
    fsm.update(DT)
    assert fsm.current == "first"


def test_a_state_can_time_itself_out():
    fsm = StateMachine("stunned")
    fsm.state("stunned").state("recovered")
    fsm.on("stunned", "recovered", lambda: fsm.time_in_state >= 0.25)

    for _ in range(10):
        fsm.update(DT)
    assert fsm.current == "stunned"
    for _ in range(10):
        fsm.update(DT)
    assert fsm.current == "recovered"


def test_previous_records_where_we_came_from():
    fsm = StateMachine()
    fsm.state("a").state("b")
    fsm.change("a")
    fsm.change("b")
    assert fsm.previous == "a"


def test_is_in_and_contains():
    fsm = StateMachine("a")
    fsm.state("a").state("b")
    fsm.update(DT)
    assert fsm.is_in("a") is True
    assert fsm.is_in("b", "a") is True
    assert fsm.is_in("b") is False
    assert "b" in fsm
    assert "c" not in fsm


def test_a_machine_with_no_initial_state_does_nothing():
    fsm = StateMachine()
    fsm.state("a")
    fsm.update(DT)                  # must not raise
    assert fsm.current is None


def test_definitions_chain():
    fsm = StateMachine("a")
    result = fsm.state("a").state("b").on("a", "b", lambda: False)
    assert result is fsm
