"""StateMachine — named behaviour states for entities.

Enemy and player behaviour is a state machine whether or not you write it as
one; done with flags it becomes a thicket of ``if self.hurt and not self.dead
and self.attack_timer <= 0``. Naming the states keeps that legible.

Each state gets optional ``enter``, ``update``, and ``exit`` callbacks. The
machine tracks ``time_in_state``, which is what most behaviour actually branches
on — patrol for two seconds, stay stunned for half of one, hold a wind-up before
a swing.

    fsm = StateMachine("patrol")
    fsm.state("patrol", update=self.patrol, exit=self.stop)
    fsm.state("chase", enter=self.shout, update=self.chase)
    fsm.on("patrol", "chase", lambda: self.sees_player)
    ...
    fsm.update(dt)          # runs the current state and any due transition

No pygame import: this is pure logic and is trivially unit-testable.
"""

from __future__ import annotations

import inspect
from collections.abc import Callable

Action = Callable[[], None] | Callable[[float], None] | None
Guard = Callable[[], bool]


def _wants_dt(fn) -> bool:
    """True if ``fn`` accepts a positional argument.

    Decided once, when the state is defined, rather than by catching TypeError
    at call time — which would also swallow a genuine TypeError raised inside
    the callback and send the blame to the wrong place.
    """
    try:
        sig = inspect.signature(fn)
    except (TypeError, ValueError):     # builtins and C callables
        return False
    for param in sig.parameters.values():
        if param.kind in (param.POSITIONAL_ONLY, param.POSITIONAL_OR_KEYWORD):
            if param.default is param.empty:
                return True
        elif param.kind is param.VAR_POSITIONAL:
            return True
    return False


class _State:
    __slots__ = ("enter", "exit", "name", "update", "update_takes_dt")

    def __init__(self, name: str, enter: Action, update: Action,
                 exit: Action) -> None:
        self.name = name
        self.enter = enter
        self.update = update
        self.exit = exit
        self.update_takes_dt = update is not None and _wants_dt(update)


class StateMachine:
    """A named-state machine with optional guarded transitions."""

    def __init__(self, initial: str | None = None) -> None:
        self._states: dict[str, _State] = {}
        self._transitions: list[tuple[str | None, str, Guard]] = []
        self.current: str | None = None
        #: Seconds since the current state was entered.
        self.time_in_state = 0.0
        self.previous: str | None = None
        self._pending: str | None = initial

    # -- definition -----------------------------------------------------------
    def state(self, name: str, *, enter: Action = None, update: Action = None,
              exit: Action = None) -> StateMachine:
        """Define a state. Returns self, so definitions can be chained."""
        self._states[name] = _State(name, enter, update, exit)
        return self

    def on(self, source: str | None, target: str, guard: Guard) -> StateMachine:
        """Change to ``target`` when ``guard()`` is true.

        A ``source`` of None makes it apply from any state — the usual shape for
        "took a hit" or "died", which can interrupt anything.
        """
        self._transitions.append((source, target, guard))
        return self

    # -- running --------------------------------------------------------------
    def change(self, name: str, *, force: bool = False) -> None:
        """Switch state now, running the exit and enter callbacks."""
        if name not in self._states:
            raise KeyError(
                f"no state named {name!r}; known: {sorted(self._states)}"
            )
        if name == self.current and not force:
            return
        if self.current is not None:
            leaving = self._states.get(self.current)
            if leaving is not None and leaving.exit is not None:
                leaving.exit()
        self.previous = self.current
        self.current = name
        self.time_in_state = 0.0
        entering = self._states[name]
        if entering.enter is not None:
            entering.enter()

    def update(self, dt: float) -> None:
        """Run the current state, then take the first transition that fires."""
        if self._pending is not None:
            pending, self._pending = self._pending, None
            self.change(pending)
        if self.current is None:
            return

        self.time_in_state += dt
        state = self._states[self.current]
        if state.update is not None:
            if state.update_takes_dt:
                state.update(dt)
            else:
                state.update()

        for source, target, guard in self._transitions:
            if source is not None and source != self.current:
                continue
            if target == self.current:
                continue
            if guard():
                self.change(target)
                break

    def is_in(self, *names: str) -> bool:
        return self.current in names

    def __contains__(self, name: str) -> bool:
        return name in self._states

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"<StateMachine {self.current!r} for {self.time_in_state:.2f}s>"
