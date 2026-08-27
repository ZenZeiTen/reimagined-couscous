"""Lets ``python -m retroforge`` work the same as the ``retroforge`` command."""

from .cli import main

if __name__ == "__main__":
    raise SystemExit(main())
