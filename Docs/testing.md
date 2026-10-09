# Install & Run Acceptance Checklist

## Overview

Verify that cocos-mcp-server installs correctly and all core functionality works end-to-end.

## Installation Checks

- [ ] Plugin folder exists in `extensions/cocos-mcp-server/`
- [ ] `npm install` completed without errors
- [ ] `npm run build` produced `dist/main.js` and `dist/mcp-server.js`
- [ ] Extension appears in Cocos Creator Extension Manager
- [ ] Panel opens via `Extension > Cocos MCP Server`

## Smoke Test

- [ ] Server starts (click Start Server, no errors in console)
- [ ] `GET /health` returns `{"status":"ok","ready":true,"phase":"ready"}`
- [ ] `GET /skill-tester` loads the browser test page
- [ ] `tools` count in `/health` matches expected (50)
- [ ] At least one tool call succeeds (e.g. `scene_management` with `action: "current"`)
- [ ] `run_script_diagnostics` returns within 60s without freezing the editor
- [ ] Panel shows server status (running, port, preview URL)
- [ ] Tool management tab shows all categories and allows toggling

## Final Checklist

- [ ] No port conflicts (only one LISTENING on configured port)
- [ ] No leftover processes after stopping server
- [ ] `autoStart` setting persists across editor restarts
- [ ] Scene operations work (query nodes, create node, set property)
- [ ] Prefab operations work (create, instantiate, sync)
- [ ] Diagnostic worker does not leak after multiple calls
