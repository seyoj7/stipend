import argparse
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qs, urlparse

import requests
from dotenv import load_dotenv

RETRY_DELAYS = (10, 30, 60)
TIMEOUT = 120


def log(message, error=False):
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    print(f"[{now}] {message}", file=sys.stderr if error else sys.stdout, flush=True)


def load_config():
    load_dotenv(Path(__file__).with_name(".env"))

    url = os.getenv("STIPEND_RUN_URL", "").strip()
    token = os.getenv("STIPEND_RUN_TOKEN", "").strip()
    interval_text = os.getenv("RUN_INTERVAL_MINUTES", "60").strip() or "60"

    parsed_url = urlparse(url)
    query = parse_qs(parsed_url.query)
    if parsed_url.scheme not in ("http", "https") or not parsed_url.netloc:
        raise ValueError("Set STIPEND_RUN_URL to the full HTTP(S) run endpoint URL.")
    if query.get("action") != ["run"]:
        raise ValueError("STIPEND_RUN_URL must include action=run.")
    if any(key.lower() in ("token", "auth", "authorization") for key in query):
        raise ValueError("Keep the token in STIPEND_RUN_TOKEN, not in the URL.")
    if not token:
        raise ValueError("Set STIPEND_RUN_TOKEN in the environment or .env file.")

    try:
        interval = int(interval_text)
    except ValueError:
        raise ValueError(
            "RUN_INTERVAL_MINUTES must be a positive whole number."
        ) from None
    if interval < 1:
        raise ValueError("RUN_INTERVAL_MINUTES must be a positive whole number.")
    return url, token, interval


def run_once(url, token):
    """Return success, skipped, failure, or unauthorized."""
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            response = requests.post(
                url,
                headers={"Authorization": f"Bearer {token}"},
                timeout=TIMEOUT,
            )
        except requests.Timeout:
            reason = "request timed out"
        except requests.ConnectionError:
            reason = "connection failed"
        except requests.RequestException:
            log("Could not send the request.", error=True)
            return "failure"
        else:
            status = response.status_code
            if status == 401:
                log("HTTP 401: check STIPEND_RUN_TOKEN.", error=True)
                return "unauthorized"
            if status == 409:
                log("HTTP 409: another run is in progress; skipping this round.")
                return "skipped"
            if status == 200:
                try:
                    data = response.json()
                except requests.JSONDecodeError:
                    data = {}
                decisions = data.get("decisions", []) if isinstance(data, dict) else []
                decisions = decisions if isinstance(decisions, list) else []
                paid = sum(
                    isinstance(item, dict) and item.get("decision") == "paid"
                    for item in decisions
                )
                blocked = sum(
                    isinstance(item, dict)
                    and item.get("decision") in ("blocked", "rejected")
                    for item in decisions
                )
                errors = sum(
                    isinstance(item, dict) and item.get("decision") == "error"
                    for item in decisions
                )
                log(f"HTTP 200: paid={paid}, blocked={blocked}, errors={errors}.")
                return "success"
            if not 500 <= status < 600:
                log(f"Request failed with HTTP {status}.", error=True)
                return "failure"
            reason = f"server returned HTTP {status}"

        if attempt == len(RETRY_DELAYS):
            log(f"Run failed after {attempt + 1} attempts: {reason}.", error=True)
            return "failure"
        delay = RETRY_DELAYS[attempt]
        log(f"{reason}; retrying in {delay} seconds.", error=True)
        time.sleep(delay)


def main():
    parser = argparse.ArgumentParser(
        description="Run the Stipend payment agent on a schedule."
    )
    parser.add_argument("--once", action="store_true", help="run once and exit")
    args = parser.parse_args()

    try:
        url, token, interval = load_config()
    except ValueError as error:
        log(str(error), error=True)
        return 1

    if args.once:
        return 0 if run_once(url, token) in ("success", "skipped") else 1

    log(f"Scheduler started; checking every {interval} minutes.")
    try:
        while True:
            if run_once(url, token) == "unauthorized":
                log(
                    "Scheduler stopped. Check STIPEND_RUN_TOKEN before restarting.",
                    error=True,
                )
                return 1
            time.sleep(interval * 60)
    except KeyboardInterrupt:
        log("Scheduler stopped.")
        return 0


if __name__ == "__main__":
    raise SystemExit(main())
