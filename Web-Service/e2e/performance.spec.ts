import { test, expect } from '@playwright/test';

test.describe('Performance and Load Testing', () => {
  test('should load homepage within acceptable time', async ({ page }) => {
    const startTime = Date.now();

    await page.goto('/');

    const loadTime = Date.now() - startTime;

    // Homepage should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should have responsive API endpoints', async ({ request }) => {
    const startTime = Date.now();

    await request.get('/api/health');

    const responseTime = Date.now() - startTime;

    // API should respond within 1 second
    expect(responseTime).toBeLessThan(1000);
  });

  test('should handle concurrent requests', async ({ request }) => {
    const requests = Array(10).fill(null).map(() =>
      request.get('/api/health')
    );

    const responses = await Promise.all(requests);

    // All requests should succeed
    responses.forEach(response => {
      expect(response.ok()).toBeTruthy();
    });
  });

  test('should serve static assets efficiently', async ({ page }) => {
    await page.goto('/');

    // Get all resource timings
    const resourceTimings = await page.evaluate(() => {
      return performance.getEntriesByType('resource').map(entry => ({
        name: entry.name,
        duration: (entry as PerformanceResourceTiming).duration,
        size: (entry as PerformanceResourceTiming).transferSize
      }));
    });

    // Check that JavaScript bundles are not too large
    const jsResources = resourceTimings.filter(r => r.name.includes('.js'));

    jsResources.forEach(resource => {
      // Each JS file should load within 3 seconds
      expect(resource.duration).toBeLessThan(3000);
    });
  });

  test('should have acceptable page metrics', async ({ page }) => {
    await page.goto('/login');

    // Wait for page to be fully loaded
    await page.waitForLoadState('networkidle');

    const metrics = await page.evaluate(() => {
      const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

      return {
        domContentLoaded: navigation.domContentLoadedEventEnd - navigation.domContentLoadedEventStart,
        loadComplete: navigation.loadEventEnd - navigation.loadEventStart,
        firstPaint: performance.getEntriesByType('paint').find(e => e.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || 0,
      };
    });

    // DOM should be interactive within 2 seconds
    expect(metrics.domContentLoaded).toBeLessThan(2000);

    // First paint should happen within 1 second
    expect(metrics.firstPaint).toBeLessThan(1000);

    console.log('Performance Metrics:', metrics);
  });
});
