# Stipend Scheduler

A small Python program that calls the Stipend agent endpoint on a timer. It runs separately from the Next.js app and does not change or run inside the smart contract.

## Setup

1. Install Python 3.9 or newer.
2. From this folder, install the two dependencies:

   ```bash
   python -m pip install -r requirements.txt
   ```

3. Copy `.env.example` to `.env`.
4. Fill in the values:

   ```dotenv
   STIPEND_RUN_URL=https://your-app.vercel.app/api?action=run
   STIPEND_RUN_TOKEN=paste-the-same-token-set-as-AGENT_RUN_TOKEN-in-vercel
   RUN_INTERVAL_MINUTES=60
   ```

   `STIPEND_RUN_URL` must be the full run endpoint URL. Keep the token in `STIPEND_RUN_TOKEN`; never add it to the URL. The app and scheduler must use the same token.

## Run continuously

Start the scheduler from this folder:

```bash
python scheduler.py
```

It makes one run immediately, then waits the configured interval before the next one. The default interval is 60 minutes. Press Ctrl+C to stop it cleanly. Timeouts, connection failures, and server errors are retried up to three times with waits of 10, 30, and 60 seconds. If all retries fail, the scheduler logs the failure and waits for the next interval.

## Run once with a system scheduler

Use `--once` to make one call and exit. It exits with code 0 after a successful run or a 409 skip, and code 1 after a failure or wrong token.

### Cron

For example, run once every hour. Replace the folder path with the location where you saved this scheduler:

```cron
0 * * * * cd /path/to/stipend-scheduler && python3 scheduler.py --once
```

### Windows Task Scheduler

Create a task with a repeating hourly trigger and set:

- **Program/script:** the path to `python.exe`
- **Add arguments:** `C:\path\to\stipend-scheduler\scheduler.py --once`
- **Start in:** `C:\path\to\stipend-scheduler`

The script reads `.env` from its own folder, so the task can run regardless of its working directory.

## Logs and troubleshooting

Each attempt logs its UTC time, HTTP status, and decision counts. The run token is never printed. If a run returns 200, the log includes counts for paid, blocked, and errored decisions. A response with nothing to pay is still a successful run.

- **401 Unauthorized:** the app and scheduler tokens differ, or `AGENT_RUN_TOKEN` is missing. Check `STIPEND_RUN_TOKEN` in this folder's `.env` and `AGENT_RUN_TOKEN` in Vercel. Do not add the token to the URL.
- **409 Run already in progress:** this round is skipped without retry. Let the current run finish; the next scheduled call will try again.
- **Timeout:** the app or chain RPC did not respond within 120 seconds. The scheduler retries, then continues at the next interval. Check the Vercel function logs and Aevum RPC availability.
- **Other 5xx errors:** the scheduler retries with the same waits. If they continue, check the Vercel function logs and the app's health endpoint at `/api?action=health`.

Keep `.env` private and never commit it. The included `.gitignore` already excludes it.
