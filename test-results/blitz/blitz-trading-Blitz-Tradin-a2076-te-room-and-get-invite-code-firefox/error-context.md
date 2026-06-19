# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 02 - Create private room and get invite code
- Location: e2e/blitz-trading.spec.ts:182:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-xO0lRK -juggler-pipe -silent
<launched> pid=142467
[pid=142467][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=142467][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=142467][err] Couldn't load XPCOM.
[pid=142467] <process did exit: exitCode=255, signal=null>
[pid=142467] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-xO0lRK -juggler-pipe -silent
  - <launched> pid=142467
  - [pid=142467][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=142467][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=142467][err] Couldn't load XPCOM.
  - [pid=142467] <process did exit: exitCode=255, signal=null>
  - [pid=142467] starting temporary directories cleanup
  - [pid=142467] <gracefully close start>
  - [pid=142467] <kill>
  - [pid=142467] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=142467] finished temporary directories cleanup
  - [pid=142467] <gracefully close end>

```