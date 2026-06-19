# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 15 - Full trading flow: open → close → result
- Location: e2e/blitz-trading.spec.ts:419:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-VgMO7K -juggler-pipe -silent
<launched> pid=143671
[pid=143671][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143671][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143671][err] Couldn't load XPCOM.
[pid=143671] <process did exit: exitCode=255, signal=null>
[pid=143671] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-VgMO7K -juggler-pipe -silent
  - <launched> pid=143671
  - [pid=143671][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143671][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143671][err] Couldn't load XPCOM.
  - [pid=143671] <process did exit: exitCode=255, signal=null>
  - [pid=143671] starting temporary directories cleanup
  - [pid=143671] <gracefully close start>
  - [pid=143671] <kill>
  - [pid=143671] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143671] finished temporary directories cleanup
  - [pid=143671] <gracefully close end>

```