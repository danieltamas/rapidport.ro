"""pg-boss consumer entry point for the migrator worker.

Downstream task consumer-pgboss will implement the full consumer loop.
"""

import sys


async def main() -> None:
    """Async entry point for the pg-boss consumer.

    Stub — not yet implemented. Returns immediately.
    """
    print("consumer: not implemented yet", file=sys.stderr)
    sys.exit(0)
