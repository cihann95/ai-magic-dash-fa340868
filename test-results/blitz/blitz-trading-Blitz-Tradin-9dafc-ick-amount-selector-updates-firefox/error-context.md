# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: blitz-trading.spec.ts >> Blitz Trading Flow >> 07 - Quick amount selector updates
- Location: e2e/blitz-trading.spec.ts:274:3

# Error details

```
Error: browserType.launch: Failed to launch the browser process.
Browser logs:

<launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-mqAEja -juggler-pipe -silent
<launched> pid=143104
[pid=143104][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
[pid=143104][err] libasound.so.2: cannot open shared object file: No such file or directory
[pid=143104][err] Couldn't load XPCOM.
[pid=143104] <process did exit: exitCode=255, signal=null>
[pid=143104] starting temporary directories cleanup
Call log:
  - <launching> /home/user/.cache/ms-playwright/firefox-1532/firefox/firefox -no-remote -headless -profile /tmp/playwright_firefoxdev_profile-mqAEja -juggler-pipe -silent
  - <launched> pid=143104
  - [pid=143104][err] XPCOMGlueLoad error for file /home/user/.cache/ms-playwright/firefox-1532/firefox/libxul.so:
  - [pid=143104][err] libasound.so.2: cannot open shared object file: No such file or directory
  - [pid=143104][err] Couldn't load XPCOM.
  - [pid=143104] <process did exit: exitCode=255, signal=null>
  - [pid=143104] starting temporary directories cleanup
  - [pid=143104] <gracefully close start>
  - [pid=143104] <kill>
  - [pid=143104] <skipped force kill spawnedProcess.killed=false processClosed=true>
  - [pid=143104] finished temporary directories cleanup
  - [pid=143104] <gracefully close end>

```