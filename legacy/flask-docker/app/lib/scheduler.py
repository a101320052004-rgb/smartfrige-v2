from __future__ import annotations

import logging
import os
import sys
import threading
import time
from datetime import datetime

from app.features.notifications import service as notification_service
from app.features.settings import schedules


LOGGER = logging.getLogger(__name__)
CHECK_INTERVAL_SECONDS = 180
EXPIRY_BATCH_INTERVAL_HOURS = 3
_started = False
_lock = threading.Lock()


def start_scheduler(app) -> None:
    global _started

    if app.config.get("TESTING"):
        return

    if _should_skip_for_flask_cli():
        return

    with _lock:
        if _started:
            return
        _started = True

    thread = threading.Thread(
        target=_run_loop,
        args=(app,),
        name="smartfridge-scheduler",
        daemon=True,
    )
    thread.start()
    LOGGER.info("Smart Fridge scheduler started")


def _should_skip_for_flask_cli() -> bool:
    if os.environ.get("FLASK_RUN_FROM_CLI") != "true":
        return False

    command = sys.argv[1] if len(sys.argv) > 1 else ""
    if command != "run":
        return True

    uses_reloader = "--reload" in sys.argv or os.environ.get("FLASK_DEBUG") == "1"
    return uses_reloader and os.environ.get("WERKZEUG_RUN_MAIN") != "true"


def _run_loop(app) -> None:
    last_keys: set[tuple[str, str]] = set()

    while True:
        now = datetime.now()
        minute_key = now.strftime("%Y-%m-%d %H:%M")
        time_text = now.strftime("%H:%M")

        if ("expiry", minute_key) not in last_keys:
            _run_expiry_jobs(app, time_text)
            last_keys.add(("expiry", minute_key))

        if len(last_keys) > 20:
            today = now.strftime("%Y-%m-%d")
            last_keys = {key for key in last_keys if key[1].startswith(today)}

        time.sleep(CHECK_INTERVAL_SECONDS)


def _run_expiry_jobs(app, time_text: str) -> None:
    with app.app_context():
        for user_id in schedules.fetch_user_ids_due_for_recurring_expiry(time_text, EXPIRY_BATCH_INTERVAL_HOURS):
            try:
                result = notification_service.sync_expiry_notifications(user_id)
                LOGGER.info(
                    "Scheduled expiry sync finished for user %s, created=%s",
                    user_id,
                    result.get("created"),
                )
            except Exception:
                LOGGER.exception("Scheduled expiry sync failed for user %s", user_id)
