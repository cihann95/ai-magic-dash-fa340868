# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: auth.flow.spec.ts >> Auth Flow >> 06 - Signup mode renders signup form
- Location: e2e/auth.flow.spec.ts:280:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /kayıt|sign.?up/i })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('button', { name: /kayıt|sign.?up/i })

```

# Page snapshot

```yaml
- generic [ref=e2]:
  - region "Notifications (F8)":
    - list
  - region "Notifications alt+T"
  - generic [ref=e3]:
    - banner [ref=e4]:
      - link "Lumen Trade" [ref=e5] [cursor=pointer]:
        - /url: /
        - img [ref=e7]
        - generic [ref=e10]: Lumen Trade
    - generic [ref=e12]:
      - generic [ref=e13]:
        - heading "Hesap oluşturun" [level=1] [ref=e14]
        - paragraph [ref=e15]: AI destekli analizler, gerçek zamanlı grafikler ve sıfır kur…
      - generic [ref=e16]:
        - generic [ref=e17]:
          - text: Görünen Ad
          - textbox "Görünen Ad" [ref=e18]:
            - /placeholder: Alex
        - generic [ref=e19]:
          - text: E-posta
          - textbox "E-posta" [ref=e20]:
            - /placeholder: you@example.com
        - generic [ref=e21]:
          - text: Şifre
          - textbox "Şifre" [ref=e22]
        - button "Üye Ol" [ref=e23] [cursor=pointer]
      - generic [ref=e25]:
        - text: Hesabınız var mı?
        - button "Giriş Yap" [ref=e26] [cursor=pointer]
```

# Test source

```ts
  187 |     // Screenshot before submit
  188 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "02-login-filled.png"), fullPage: true });
  189 | 
  190 |     // Submit
  191 |     await page.getByRole("button", { name: /giriş|sign.?in/i }).click();
  192 | 
  193 |     // Wait for navigation to dashboard
  194 |     await page.waitForURL("**/", { timeout: 10_000 });
  195 |     await page.waitForLoadState("domcontentloaded");
  196 |     await page.waitForTimeout(2000);
  197 | 
  198 |     // Verify we're on the dashboard (Index page)
  199 |     expect(page.url()).toContain("/");
  200 | 
  201 |     // Screenshot dashboard
  202 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "03-dashboard-after-login.png"), fullPage: true });
  203 |   });
  204 | 
  205 |   test("03 - Invalid login shows error", async ({ page }) => {
  206 |     await mockAuthFailure(page);
  207 |     await page.goto("/auth");
  208 |     await page.waitForLoadState("domcontentloaded");
  209 |     await page.waitForTimeout(1000);
  210 | 
  211 |     // Fill in invalid credentials
  212 |     await page.locator("#email").fill("wrong@example.com");
  213 |     await page.locator("#password").fill("WrongPassword!");
  214 | 
  215 |     // Submit
  216 |     await page.getByRole("button", { name: /giriş|sign.?in/i }).click();
  217 | 
  218 |     // Wait for error toast to appear
  219 |     await page.waitForTimeout(2000);
  220 | 
  221 |     // Screenshot showing error state
  222 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "04-invalid-login-error.png"), fullPage: true });
  223 | 
  224 |     // Verify still on auth page (no redirect)
  225 |     expect(page.url()).toContain("/auth");
  226 | 
  227 |     // Verify error toast is visible (sonner or radix toast)
  228 |     const errorVisible = await page.locator("[data-sonner-toaster], [role='status']").isVisible().catch(() => false);
  229 |     // At minimum, verify we stayed on auth page
  230 |     await expect(page.getByRole("button", { name: /giriş|sign.?in/i })).toBeVisible();
  231 |   });
  232 | 
  233 |   test("04 - Logout redirects to login page", async ({ page }) => {
  234 |     await mockAuthPreAuthenticated(page);
  235 | 
  236 |     // Start on a page that has a logout mechanism (Settings)
  237 |     await page.goto("/settings");
  238 |     await page.waitForLoadState("domcontentloaded");
  239 |     await page.waitForTimeout(2000);
  240 | 
  241 |     // Verify we're on settings (authenticated)
  242 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "05-settings-authenticated.png"), fullPage: true });
  243 | 
  244 |     // Find and click the sign out button
  245 |     const signOutBtn = page.getByRole("button", { name: /çıkış|sign.?out|oturumu kapat/i });
  246 | 
  247 |     if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  248 |       await signOutBtn.click();
  249 |     } else {
  250 |       // Fallback: look for any logout-related text
  251 |       const logoutLink = page.getByText(/çıkış|sign.?out|log.?out/i).first();
  252 |       if (await logoutLink.isVisible({ timeout: 2000 }).catch(() => false)) {
  253 |         await logoutLink.click();
  254 |       }
  255 |     }
  256 | 
  257 |     // After logout, the app should redirect to auth or show unauthenticated state
  258 |     await page.waitForTimeout(3000);
  259 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "06-after-logout.png"), fullPage: true });
  260 |   });
  261 | 
  262 |   test("05 - Protected route redirects to login when unauthenticated", async ({ page }) => {
  263 |     // No auth mock → no session → should redirect
  264 |     await mockAuthSuccess(page); // session = null
  265 | 
  266 |     // Navigate directly to a protected route (Settings wraps with ProtectedRoute)
  267 |     await page.goto("/settings");
  268 |     await page.waitForLoadState("domcontentloaded");
  269 |     await page.waitForTimeout(3000);
  270 | 
  271 |     // Verify redirect to /auth
  272 |     const url = page.url();
  273 |     const redirectedToAuth = url.includes("/auth");
  274 | 
  275 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "07-protected-route-redirect.png"), fullPage: true });
  276 | 
  277 |     expect(redirectedToAuth).toBeTruthy();
  278 |   });
  279 | 
  280 |   test("06 - Signup mode renders signup form", async ({ page }) => {
  281 |     await mockAuthSuccess(page);
  282 |     await page.goto("/auth?mode=signup");
  283 |     await page.waitForLoadState("domcontentloaded");
  284 |     await page.waitForTimeout(1500);
  285 | 
  286 |     // Verify signup-specific elements are visible
> 287 |     await expect(page.getByRole("button", { name: /kayıt|sign.?up/i })).toBeVisible();
      |                                                                         ^ Error: expect(locator).toBeVisible() failed
  288 | 
  289 |     // Screenshot signup page
  290 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "08-signup-page.png"), fullPage: true });
  291 |   });
  292 | 
  293 |   test("07 - Full auth flow: login → dashboard → settings → logout", async ({ page }) => {
  294 |     // Step 1: Start at auth page
  295 |     await mockAuthSuccess(page);
  296 |     await page.goto("/auth");
  297 |     await page.waitForLoadState("domcontentloaded");
  298 |     await page.waitForTimeout(1000);
  299 | 
  300 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "09-flow-start-auth.png"), fullPage: true });
  301 | 
  302 |     // Step 2: Login
  303 |     await page.locator("#email").fill("auth-test@lumen.trade");
  304 |     await page.locator("#password").fill("TestPassword123!");
  305 |     await page.getByRole("button", { name: /giriş|sign.?in/i }).click();
  306 | 
  307 |     await page.waitForURL("**/", { timeout: 10_000 });
  308 |     await page.waitForLoadState("domcontentloaded");
  309 |     await page.waitForTimeout(2000);
  310 | 
  311 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "10-flow-dashboard.png"), fullPage: true });
  312 | 
  313 |     // Step 3: Navigate to settings
  314 |     await mockAuthPreAuthenticated(page);
  315 |     await page.goto("/settings");
  316 |     await page.waitForLoadState("domcontentloaded");
  317 |     await page.waitForTimeout(2000);
  318 | 
  319 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "11-flow-settings.png"), fullPage: true });
  320 | 
  321 |     // Step 4: Logout
  322 |     const signOutBtn = page.getByRole("button", { name: /çıkış|sign.?out|oturumu kapat/i });
  323 |     if (await signOutBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
  324 |       await signOutBtn.click();
  325 |       await page.waitForTimeout(3000);
  326 |     }
  327 | 
  328 |     await page.screenshot({ path: path.join(SCREENSHOT_DIR, "12-flow-final.png"), fullPage: true });
  329 |   });
  330 | });
  331 | 
```