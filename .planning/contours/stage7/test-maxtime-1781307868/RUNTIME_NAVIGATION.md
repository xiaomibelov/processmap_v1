# Runtime Navigation: stage7/test-maxtime-1781307868

## Runtime Scope

This contour modifies the agent scheduler server (`tools/agent-ui/server.js`) and adds unit tests. There is no browser UI navigation required.

## Local Server Verification (optional)

If the worker chooses to verify the server still starts after the refactor:

```bash
cd /opt/processmap-test/tools/agent-ui
node -e "require('./server.js'); console.log('server module loads')"
```

The server module loads Express and starts listening; a short require-time check is enough to confirm the import path and syntax are valid.

## No UI Sessions

- No login, organization, workspace, project, or session navigation.
- No Playwright/browser runtime proof required.
