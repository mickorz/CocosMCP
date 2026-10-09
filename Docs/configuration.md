# Configuration Reference

## Configuration Fields

Settings are stored in `settings/mcp-server.json` (in your Cocos Creator project root) and can be edited via the panel.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| port | number | 3001 | HTTP server port (bound to 127.0.0.1) |
| autoStart | boolean | false | Auto-start server when editor loads |
| autoOpenPanel | boolean | true | Auto-open panel when editor loads |
| enableDebugLog | boolean | false | Verbose logging for development |
| maxConnections | number | 10 | Max concurrent HTTP connections |
| allowedOrigins | string[] | ["*"] | CORS allowed origins |

Tool configuration is stored separately in `settings/tool-manager.json`, supporting multiple named configurations with per-tool enable/disable.

## Taking Effect & Verification

- **Port change**: stop server, create new MCPServer instance, restart on new port
- **Tool enable/disable**: applied immediately without server restart (live tool list update)
- **Verify**: `GET /health` returns current tool count and ready state

## Upgrade

1. Delete `settings/mcp-server.json` and `settings/tool-manager.json` in your project (required to avoid stale config)
2. Replace the `extensions/cocos-mcp-server` folder with the new version
3. Run `npm install && npm run build`
4. Restart Cocos Creator

## Uninstall

Use the **Uninstall** button in the panel header. This will:
- Remove installed skills from all selected platforms
- Remove `.mcp.json` from project root
- Attempt to uninstall the extension itself via `Editor.Message.request('extension', 'uninstall-extension')`
