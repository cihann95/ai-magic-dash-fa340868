# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 08 - Empty orderbook state
- Location: e2e/blitz-trading.spec.ts:292:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-wgzUBX -juggler-pipe -silent
<launched> pid=143137
[pid=143137][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143137][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143137][err] Couldn't load XPCOM.
[pid=143137] <process did exit: exitCode=255, signal=null>
[pid=143137] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-wgzUBX -juggler-pipe -silent
  - <launched> pid=143137
  - [pid=143137][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143137][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143137][err] Couldn't load XPCOM.
  - [pid=143137] <process did exit: exitCode=255, signal=null>
  - [pid=143137] starting temporary directories cleanup
  - [pid=143137] <gracefully close start>
  - [pid=143137] <kill>
  - [pid=143137] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143137] finished temporary directories cleanup
  - [pid=143137] <gracefully close end>

```