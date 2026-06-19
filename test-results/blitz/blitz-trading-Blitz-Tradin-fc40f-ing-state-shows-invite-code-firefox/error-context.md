# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 03 - Room waiting state shows invite code
- Location: e2e/blitz-trading.spec.ts:199:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-I4pj8s -juggler-pipe -silent
<launched> pid=142519
[pid=142519][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=142519][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=142519][err] Couldn't load XPCOM.
[pid=142519] <process did exit: exitCode=255, signal=null>
[pid=142519] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-I4pj8s -juggler-pipe -silent
  - <launched> pid=142519
  - [pid=142519][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=142519][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=142519][err] Couldn't load XPCOM.
  - [pid=142519] <process did exit: exitCode=255, signal=null>
  - [pid=142519] starting temporary directories cleanup
  - [pid=142519] <gracefully close start>
  - [pid=142519] <kill>
  - [pid=142519] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=142519] finished temporary directories cleanup
  - [pid=142519] <gracefully close end>

```