# Getting Started

## Prerequisites

- Cocos Creator 3.7.3 or higher (tested on 3.8.6+)
- Node.js (bundled with Cocos Creator)
- An MCP-compatible AI client (Claude CLI, Cursor, VS Code, etc.)

## Install

1. Copy the entire `cocos-mcp-server` folder into your Cocos Creator project's `extensions/` directory:

```
your-project/
├── assets/
├── extensions/
│   └── cocos-mcp-server/    <- place here
├── settings/
└── ...
```

2. Install dependencies and build:

```bash
cd extensions/cocos-mcp-server
npm install
npm run build
```

3. Restart Cocos Creator or refresh extensions in the Extension Manager.

## Verify

1. Open the panel via menu: `Extension > Cocos MCP Server`
2. The panel should display server status and tool list
3. Default port is `3001` (configurable in panel settings)

## First Run

1. Click **Start Server** in the panel
2. Verify the server is running:

```bash
curl http://127.0.0.1:3001/health
```

Expected response:
```json
{
  "status": "ok",
  "tools": 50,
  "version": "1.5.5",
  "ready": true,
  "phase": "ready"
}
```

3. Connect your AI client:

Claude CLI:
```bash
claude mcp add --transport http cocos-creator http://127.0.0.1:3001/mcp
```

Claude Desktop / Cursor:
```json
{
  "mcpServers": {
    "cocos-creator": {
      "type": "http",
      "url": "http://127.0.0.1:3001/mcp"
    }
  }
}
```

## Next Steps

- [Configuration Reference](configuration.md) - port, auto-start, tool management settings
- [How-To Guides](how-to-guides.md) - common task walkthroughs
