import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '../fixtures/extension';
import { getDefaultProviderConfig, seedStorage } from '../fixtures/storage';
import { getActiveTabId } from '../helpers/sidepanel';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VISUAL_OUTPUT_DIR = path.resolve(__dirname, '../test-results/visual-qa');

test.describe('Sidepanel visual hierarchy regression', () => {
  test('keeps the empty state balanced and the composer anchored to the bottom', async ({
    context,
    extensionId,
    serviceWorker
  }) => {
    const providerConfig = getDefaultProviderConfig();
    await seedStorage(serviceWorker, {
      ...providerConfig,
      aiProviders: providerConfig.aiProviders.map((provider) => ({ ...provider, name: 'kimi' })),
      preferred_locale: 'zh-CN',
      themeMode: 'light',
      lastPermissionModePreference: 'skip_all_permission_checks',
      tipDisplayCounts: { pin_extension: ['visual-qa'] }
    });

    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];
    const targetPage = await context.newPage();
    await targetPage.goto('https://example.com');
    await targetPage.bringToFront();

    const targetTabId = await getActiveTabId(serviceWorker);
    const sidepanel = await context.newPage();
    sidepanel.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    sidepanel.on('pageerror', (error) => pageErrors.push(error.message));

    await sidepanel.setViewportSize({ width: 514, height: 934 });
    await sidepanel.emulateMedia({ reducedMotion: 'no-preference' });
    await sidepanel.goto(
      `chrome-extension://${extensionId}/sidepanel.html?initialTabId=${targetTabId}`
    );
    await sidepanel.waitForLoadState('domcontentloaded');
    await sidepanel.waitForSelector('#root');
    await expect(sidepanel.getByTestId('empty-state-welcome')).toBeVisible();
    await expect(sidepanel.getByText('今天我能帮您什么？')).toBeVisible();
    const subtitle = sidepanel.getByTestId('empty-state-subtitle');
    await expect(subtitle).toHaveAttribute('lang', 'zh-CN');
    const wordmark = sidepanel.locator('canvas[aria-label="SuperDuck"]');
    await expect(wordmark).toBeVisible();
    await expect(sidepanel.getByTestId('superduck-wordmark')).toHaveCount(0);
    await expect(sidepanel.locator('[data-chat-input-container="true"]')).toBeVisible();
    await expect(sidepanel.locator('[data-permission-mode="full-access"]')).toBeVisible();
    // Preserve the original Canvas drawing cadence and capture the completed mark.
    await sidepanel.waitForTimeout(3000);

    await mkdir(VISUAL_OUTPUT_DIR, { recursive: true });
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '01-empty-chat-514x934.png'),
      fullPage: true
    });

    const metrics = await sidepanel.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) throw new Error(`Missing visual QA element: ${selector}`);
        const box = element.getBoundingClientRect();
        return {
          top: box.top,
          right: box.right,
          bottom: box.bottom,
          left: box.left,
          width: box.width,
          height: box.height
        };
      };

      const headerButtons = Array.from(document.querySelectorAll<HTMLElement>('header button')).map(
        (button) => {
          const box = button.getBoundingClientRect();
          return { width: box.width, height: box.height };
        }
      );
      const permission = document.querySelector<HTMLElement>(
        '[data-permission-mode="full-access"]'
      );
      if (!permission) throw new Error('Missing full-access permission trigger');
      const permissionStyle = getComputedStyle(permission);

      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        welcome: rect('[data-testid="empty-state-welcome"]'),
        logo: rect('canvas[aria-label="SuperDuck"]'),
        composer: rect('[data-chat-input-container="true"]'),
        disclaimer: rect('[data-testid="ai-disclaimer"]'),
        disclaimerText: rect('[data-testid="ai-disclaimer-link"]'),
        dock: rect('[data-testid="chat-composer-dock"]'),
        headerButtons,
        permission: {
          ...rect('[data-permission-mode="full-access"]'),
          backgroundColor: permissionStyle.backgroundColor,
          borderColor: permissionStyle.borderColor
        },
        documentScrollWidth: document.documentElement.scrollWidth
      };
    });

    expect(metrics.viewport).toEqual({ width: 514, height: 934 });
    expect(metrics.composer.height).toBeGreaterThanOrEqual(80);
    expect(metrics.composer.height).toBeLessThanOrEqual(96);
    expect(metrics.disclaimerText.top - metrics.composer.bottom).toBeGreaterThanOrEqual(5);
    expect(metrics.disclaimerText.top - metrics.composer.bottom).toBeLessThanOrEqual(10);
    expect(metrics.viewport.height - metrics.disclaimerText.bottom).toBeGreaterThanOrEqual(10);
    expect(metrics.viewport.height - metrics.disclaimerText.bottom).toBeLessThanOrEqual(16);
    expect(metrics.dock.bottom).toBe(metrics.viewport.height);
    expect(metrics.logo.width).toBeLessThanOrEqual(320);
    expect(metrics.headerButtons.length).toBeGreaterThanOrEqual(4);
    for (const button of metrics.headerButtons) {
      expect(button.width).toBeGreaterThanOrEqual(32);
      expect(button.height).toBeGreaterThanOrEqual(32);
    }
    expect(metrics.permission.height).toBe(32);
    expect(metrics.documentScrollWidth).toBe(metrics.viewport.width);

    const lightCanvasStats = await wordmark.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing wordmark canvas context');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) nonTransparentPixels += 1;
      }
      return {
        width: canvas.width,
        height: canvas.height,
        nonTransparentPixels,
        color: getComputedStyle(canvas.parentElement!).color,
        bodyBackground: getComputedStyle(document.body).backgroundColor
      };
    });
    expect(lightCanvasStats.nonTransparentPixels).toBeGreaterThan(100);
    expect(lightCanvasStats.color).toBe('rgb(156, 156, 156)');

    const chineseSubtitleStyles = await subtitle.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        color: style.color
      };
    });
    expect(chineseSubtitleStyles.fontFamily).toContain('Songti SC');
    expect(chineseSubtitleStyles.fontSize).toBe('14px');
    expect(chineseSubtitleStyles.fontWeight).toBe('400');
    expect(chineseSubtitleStyles.lineHeight).toBe('20px');

    const permissionTrigger = sidepanel.locator('[data-permission-mode="full-access"]');
    await permissionTrigger.click();
    await expect(sidepanel.getByRole('menuitemradio', { name: /请求批准/ })).toBeVisible();
    await expect(sidepanel.getByRole('menuitemradio', { name: /完全访问/ })).toBeVisible();
    await sidepanel.keyboard.press('Escape');

    const inputSurface = sidepanel.locator('[data-chat-input-container="true"]');
    const editor = sidepanel.locator('[data-chat-input-editor="true"]');
    await inputSurface.click();
    await expect(editor).toBeFocused();
    const focusedStyles = await inputSurface.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    expect(focusedStyles.boxShadow).not.toBe('none');
    expect(focusedStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)');
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '02-input-focus-514x934.png'),
      fullPage: true
    });

    await sidepanel.setViewportSize({ width: 360, height: 720 });
    await expect(sidepanel.getByTestId('empty-state-welcome')).toBeVisible();
    const narrowMetrics = await sidepanel.evaluate(() => ({
      viewportWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      composerRight: document
        .querySelector<HTMLElement>('[data-chat-input-container="true"]')!
        .getBoundingClientRect().right,
      dockRight: document
        .querySelector<HTMLElement>('[data-testid="chat-composer-dock"]')!
        .getBoundingClientRect().right
    }));
    expect(narrowMetrics.scrollWidth).toBe(narrowMetrics.viewportWidth);
    expect(narrowMetrics.composerRight).toBeLessThanOrEqual(narrowMetrics.viewportWidth);
    expect(narrowMetrics.dockRight).toBeLessThanOrEqual(narrowMetrics.viewportWidth);
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '03-empty-chat-360x720.png'),
      fullPage: true
    });

    await seedStorage(serviceWorker, { themeMode: 'dark' });
    await expect.poll(() => sidepanel.locator('html').getAttribute('data-mode')).toBe('dark');
    await expect(wordmark).toBeVisible();
    await sidepanel.waitForTimeout(400);
    await sidepanel.setViewportSize({ width: 514, height: 934 });
    await sidepanel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '04-empty-chat-dark-514x934.png'),
      fullPage: true
    });

    const darkStyles = await sidepanel.evaluate(() => {
      const composer = document.querySelector<HTMLElement>('[data-chat-input-container="true"]');
      const rotatingTip = document.querySelector<HTMLElement>('[data-testid="rotating-tip"]');
      return {
        mode: document.documentElement.dataset.mode,
        bodyBackground: getComputedStyle(document.body).backgroundColor,
        composerBackground: composer ? getComputedStyle(composer).backgroundColor : '',
        composerBorder: composer ? getComputedStyle(composer).borderColor : '',
        rotatingTipColor: rotatingTip ? getComputedStyle(rotatingTip).color : '',
        rotatingTipOpacity: rotatingTip ? getComputedStyle(rotatingTip).opacity : '',
        scrollWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        wordmarkColor: getComputedStyle(
          document.querySelector<HTMLCanvasElement>('canvas[aria-label="SuperDuck"]')!
            .parentElement!
        ).color
      };
    });
    expect(darkStyles.mode).toBe('dark');
    expect(darkStyles.composerBackground).not.toBe('rgba(0, 0, 0, 0)');
    expect(darkStyles.composerBorder).not.toBe('rgba(0, 0, 0, 0)');
    expect(darkStyles.rotatingTipColor).not.toBe('rgba(0, 0, 0, 0)');
    expect(darkStyles.rotatingTipOpacity).toBe('1');
    expect(darkStyles.wordmarkColor).toBe(lightCanvasStats.color);
    expect(darkStyles.scrollWidth).toBe(darkStyles.viewportWidth);

    await inputSurface.click();
    await expect(editor).toBeFocused();
    const darkFocusedStyles = await inputSurface.evaluate((element) => {
      const style = getComputedStyle(element);
      return { borderColor: style.borderColor, boxShadow: style.boxShadow };
    });
    expect(darkFocusedStyles.boxShadow).not.toBe('none');
    expect(darkFocusedStyles.borderColor).not.toBe('rgba(0, 0, 0, 0)');
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '05-input-focus-dark-514x934.png'),
      fullPage: true
    });

    await seedStorage(serviceWorker, { themeMode: 'light' });
    await expect.poll(() => sidepanel.locator('html').getAttribute('data-mode')).toBe('light');
    await expect(wordmark).toBeVisible();
    await sidepanel.waitForTimeout(400);
    const roundTripLightStyles = await wordmark.evaluate((element) => ({
      color: getComputedStyle(element.parentElement!).color,
      bodyBackground: getComputedStyle(document.body).backgroundColor
    }));
    expect(roundTripLightStyles.color).toBe(lightCanvasStats.color);
    expect(roundTripLightStyles.bodyBackground).toBe(lightCanvasStats.bodyBackground);
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '06-theme-roundtrip-light-514x934.png'),
      fullPage: true
    });

    // The user's 970 × 1856 bug capture is a 2× image of this CSS viewport.
    await sidepanel.setViewportSize({ width: 485, height: 928 });
    await sidepanel.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await sidepanel.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '07-original-handdraw-light-485x928.png'),
      fullPage: true
    });

    const animationPage = await context.newPage();
    animationPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    animationPage.on('pageerror', (error) => pageErrors.push(error.message));
    await animationPage.setViewportSize({ width: 485, height: 928 });
    await animationPage.emulateMedia({ reducedMotion: 'no-preference' });
    await animationPage.goto(
      `chrome-extension://${extensionId}/sidepanel.html?initialTabId=${targetTabId}`
    );
    await animationPage.waitForLoadState('domcontentloaded');
    const animatedWordmark = animationPage.locator('canvas[aria-label="SuperDuck"]');
    await expect(animatedWordmark).toBeVisible();
    await animationPage.waitForTimeout(450);
    const animationMidpoint = await animatedWordmark.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing animated wordmark canvas context');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) nonTransparentPixels += 1;
      }
      return {
        nonTransparentPixels,
        color: getComputedStyle(canvas.parentElement!).color
      };
    });
    expect(animationMidpoint.nonTransparentPixels).toBeGreaterThan(0);
    expect(animationMidpoint.color).toBe('rgb(156, 156, 156)');
    await animationPage.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '08-original-animation-midpoint-485x928.png'),
      fullPage: true
    });

    await animationPage.waitForTimeout(2800);
    const animationFinalState = await animatedWordmark.evaluate((element) => {
      const canvas = element as HTMLCanvasElement;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Missing completed wordmark canvas context');
      const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
      let nonTransparentPixels = 0;
      for (let index = 3; index < pixels.length; index += 4) {
        if (pixels[index] > 0) nonTransparentPixels += 1;
      }
      return {
        nonTransparentPixels,
        color: getComputedStyle(canvas.parentElement!).color
      };
    });
    expect(animationFinalState.nonTransparentPixels).toBeGreaterThan(
      animationMidpoint.nonTransparentPixels
    );
    expect(animationFinalState.color).toBe(animationMidpoint.color);
    await animationPage.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '09-original-animation-complete-485x928.png'),
      fullPage: true
    });

    await seedStorage(serviceWorker, { preferred_locale: 'en-US' });
    const englishPage = await context.newPage();
    englishPage.on('console', (message) => {
      if (message.type() === 'error') consoleErrors.push(message.text());
    });
    englishPage.on('pageerror', (error) => pageErrors.push(error.message));
    await englishPage.setViewportSize({ width: 485, height: 928 });
    await englishPage.goto(
      `chrome-extension://${extensionId}/sidepanel.html?initialTabId=${targetTabId}`
    );
    await englishPage.waitForLoadState('domcontentloaded');
    const englishSubtitle = englishPage.getByTestId('empty-state-subtitle');
    await expect(englishSubtitle).toHaveText('How can I help you today?');
    await expect(englishSubtitle).toHaveAttribute('lang', 'en-US');
    await englishPage.waitForTimeout(3000);
    const englishSubtitleStyles = await englishSubtitle.evaluate((element) => {
      const style = getComputedStyle(element);
      const bounds = element.getBoundingClientRect();
      return {
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        color: style.color,
        width: bounds.width,
        viewportWidth: window.innerWidth
      };
    });
    expect(englishSubtitleStyles.fontFamily).toContain('Iowan Old Style');
    expect(englishSubtitleStyles.fontSize).toBe('15px');
    expect(englishSubtitleStyles.fontWeight).toBe('400');
    expect(englishSubtitleStyles.lineHeight).toBe('21px');
    expect(englishSubtitleStyles.width).toBeLessThan(englishSubtitleStyles.viewportWidth);
    await englishPage.screenshot({
      path: path.join(VISUAL_OUTPUT_DIR, '10-empty-chat-en-485x928.png'),
      fullPage: true
    });

    expect(consoleErrors).toEqual([]);
    expect(pageErrors).toEqual([]);

    await writeFile(
      path.join(VISUAL_OUTPUT_DIR, 'metrics.json'),
      JSON.stringify(
        {
          metrics,
          focusedStyles,
          narrowMetrics,
          darkStyles,
          darkFocusedStyles,
          lightCanvasStats,
          roundTripLightStyles,
          animationMidpoint,
          animationFinalState,
          chineseSubtitleStyles,
          englishSubtitleStyles,
          consoleErrors,
          pageErrors
        },
        null,
        2
      )
    );

    await englishPage.close();
    await animationPage.close();
    await sidepanel.close();
    await targetPage.close();
  });
});
