# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 06 - Place SHORT order
- Location: e2e/blitz-trading.spec.ts:256:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-R4FEYB -juggler-pipe -silent
<launched> pid=143081
[pid=143081][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143081][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143081][err] Couldn't load XPCOM.
[pid=143081] <process did exit: exitCode=255, signal=null>
[pid=143081] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-R4FEYB -juggler-pipe -silent
  - <launched> pid=143081
  - [pid=143081][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143081][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143081][err] Couldn't load XPCOM.
  - [pid=143081] <process did exit: exitCode=255, signal=null>
  - [pid=143081] starting temporary directories cleanup
  - [pid=143081] <gracefully close start>
  - [pid=143081] <kill>
  - [pid=143081] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143081] finished temporary directories cleanup
  - [pid=143081] <gracefully close end>

```