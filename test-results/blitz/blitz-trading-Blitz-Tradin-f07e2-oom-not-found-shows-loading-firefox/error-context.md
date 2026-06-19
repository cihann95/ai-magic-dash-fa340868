# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 11 - Edge case: room not found shows loading
- Location: e2e/blitz-trading.spec.ts:362:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-ZnxJqb -juggler-pipe -silent
<launched> pid=143245
[pid=143245][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143245][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143245][err] Couldn't load XPCOM.
[pid=143245] <process did exit: exitCode=255, signal=null>
[pid=143245] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-ZnxJqb -juggler-pipe -silent
  - <launched> pid=143245
  - [pid=143245][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143245][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143245][err] Couldn't load XPCOM.
  - [pid=143245] <process did exit: exitCode=255, signal=null>
  - [pid=143245] starting temporary directories cleanup
  - [pid=143245] <gracefully close start>
  - [pid=143245] <kill>
  - [pid=143245] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143245] finished temporary directories cleanup
  - [pid=143245] <gracefully close end>

```