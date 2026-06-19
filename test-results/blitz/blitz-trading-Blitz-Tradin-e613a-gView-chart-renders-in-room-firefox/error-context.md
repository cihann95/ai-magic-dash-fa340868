# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 14 - TradingView chart renders in room
- Location: e2e/blitz-trading.spec.ts:407:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-yhYtLl -juggler-pipe -silent
<launched> pid=143651
[pid=143651][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143651][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143651][err] Couldn't load XPCOM.
[pid=143651] <process did exit: exitCode=255, signal=null>
[pid=143651] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-yhYtLl -juggler-pipe -silent
  - <launched> pid=143651
  - [pid=143651][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143651][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143651][err] Couldn't load XPCOM.
  - [pid=143651] <process did exit: exitCode=255, signal=null>
  - [pid=143651] starting temporary directories cleanup
  - [pid=143651] <gracefully close start>
  - [pid=143651] <kill>
  - [pid=143651] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143651] finished temporary directories cleanup
  - [pid=143651] <gracefully close end>

```