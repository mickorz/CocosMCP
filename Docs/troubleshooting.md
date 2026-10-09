# Troubleshooting

## Installation

**Server won't start — port in use**

Check for stale processes:
```bash
netstat -ano | findstr :3001
```
Kill the process or change the port in the panel settings.

**Tools list shows 0 or incorrect count**

Delete stale config files in your project:
```
settings/mcp-server.json
settings/tool-manager.json
```
Restart the editor. This is required after upgrades.

**`npm run build` fails with TypeScript errors**

Ensure `@cocos/creator-types` is installed:
```bash
npm install
npm run build
```

## Runtime

**AI client cannot connect**

1. Verify server is running: `curl http://127.0.0.1:3001/health`
2. Check the URL uses `127.0.0.1` not `localhost` (some clients resolve differently)
3. Verify firewall allows local connections on the configured port

**`/health` returns `ready: false`**

Check the `phase` field to identify which stage is incomplete:
- `extensionLoading` — extension not fully loaded yet
- `serverStarting` — HTTP server not started
- `toolsRegistering` — tool setup in progress
- `sceneLoading` — scene not ready, wait for editor to finish loading

**Tool call returns error**

1. Ensure scene is loaded (some tools require an open scene)
2. Check the tool parameters match the schema (use the test page for validation)
3. Look at the editor console for error logs

**Editor freezes during `run_script_diagnostics`**

The diagnostics worker runs TypeScript compilation in a separate thread. First call may take a few seconds (loading TypeScript module). Subsequent calls reuse the persistent worker and should be fast.

If persistent freezing occurs, check if `worker_threads` is available in the Cocos Creator Node.js runtime.

## Still Stuck

- Report issues at [GitHub Issues](https://github.com/mickorz/CocosMCP/issues)
- Contact: mike.newsky@gmail.com
