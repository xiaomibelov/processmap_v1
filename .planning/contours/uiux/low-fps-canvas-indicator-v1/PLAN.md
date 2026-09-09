# Low FPS canvas indicator

1. Reuse the existing compositor-cheap canvas spinner.
2. Detect sustained FPS below 10 with recovery hysteresis.
3. Temporarily intercept canvas pointer input while responsiveness recovers.
4. Ignore incomplete samples and hidden browser tabs.
5. Verify threshold behavior, existing load UI, lint, and production build.
