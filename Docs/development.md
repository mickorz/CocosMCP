# Contributor Guide

## Environment & Common Commands

```bash
npm install          # Install dependencies
npm run build        # Compile TypeScript to dist/
npm run watch        # Watch mode (tsc -w)
```

Requires `@cocos/creator-types` for Editor API type definitions.

## Architecture at a Glance

```
main.ts                  Extension entry (load/unload lifecycle)
  ├── mcp-server.ts      HTTP server + MCP protocol + tool routing
  ├── tools/             14 tool classes, 50 operations total
  │   ├── scene-tools.ts
  │   ├── node-tools.ts
  │   ├── component-tools.ts
  │   ├── prefab-tools.ts
  │   ├── project-tools.ts
  │   ├── debug-tools.ts       (includes run_script_diagnostics)
  │   ├── diagnostics.ts       (TypeScript compilation via worker_threads)
  │   ├── script-tools.ts
  │   ├── preferences-tools.ts
  │   ├── server-tools.ts
  │   ├── broadcast-tools.ts
  │   ├── scene-view-tools.ts
  │   ├── reference-image-tools.ts
  │   ├── asset-advanced-tools.ts
  │   └── validation-tools.ts
  ├── panels/default/    Vue 3 panel UI
  ├── scene.ts           Scene process script (IPC bridge)
  └── settings.ts        Persistent settings (mcp-server.json)
```

Tool naming: `${category}_${tool.name}` (e.g. `scene_management`). Execute via `executeToolCall()` which splits by first underscore.

## Tests

No automated test framework. Manual testing via:
- Browser test page at `http://127.0.0.1:{port}/skill-tester`
- `curl` against `/health`, `/mcp`, and `/api/*` endpoints

## Local Development Loop

1. Edit TypeScript in `source/`
2. `npm run watch` compiles to `dist/` on save
3. Reload extension in Cocos Creator Extension Manager
4. Test via skill-tester page or direct MCP calls

## Release

1. Bump version in `package.json`
2. `npm run build`
3. Commit and push to `master`
4. Tag release on GitHub
