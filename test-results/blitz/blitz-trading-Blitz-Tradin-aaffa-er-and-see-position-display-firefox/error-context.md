# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 05 - Place LONG order and see position display
- Location: e2e/blitz-trading.spec.ts:236:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-2FAO5c -juggler-pipe -silent
<launched> pid=142882
[pid=142882][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=142882][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=142882][err] Couldn't load XPCOM.
[pid=142882] <process did exit: exitCode=255, signal=null>
[pid=142882] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-2FAO5c -juggler-pipe -silent
  - <launched> pid=142882
  - [pid=142882][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=142882][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=142882][err] Couldn't load XPCOM.
  - [pid=142882] <process did exit: exitCode=255, signal=null>
  - [pid=142882] starting temporary directories cleanup
  - [pid=142882] <gracefully close start>
  - [pid=142882] <kill>
  - [pid=142882] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=142882] finished temporary directories cleanup
  - [pid=142882] <gracefully close end>

```