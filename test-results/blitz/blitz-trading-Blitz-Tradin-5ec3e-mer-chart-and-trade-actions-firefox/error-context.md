# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 04 - Active room shows timer, chart, and trade actions
- Location: e2e/blitz-trading.spec.ts:212:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-bXDOWm -juggler-pipe -silent
<launched> pid=142683
[pid=142683][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=142683][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=142683][err] Couldn't load XPCOM.
[pid=142683] <process did exit: exitCode=255, signal=null>
[pid=142683] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-bXDOWm -juggler-pipe -silent
  - <launched> pid=142683
  - [pid=142683][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=142683][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=142683][err] Couldn't load XPCOM.
  - [pid=142683] <process did exit: exitCode=255, signal=null>
  - [pid=142683] starting temporary directories cleanup
  - [pid=142683] <gracefully close start>
  - [pid=142683] <kill>
  - [pid=142683] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=142683] finished temporary directories cleanup
  - [pid=142683] <gracefully close end>

```