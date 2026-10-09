# How-To Guides

## Start the MCP Server

1. Open panel: `Extension > Cocos MCP Server`
2. Click **Start Server**
3. Verify with `curl http://127.0.0.1:3001/health` — `ready` should be `true`

## Connect Claude CLI

```bash
claude mcp add --transport http cocos-creator http://127.0.0.1:3001/mcp
```

## Run TypeScript Diagnostics

Send an MCP tool call or use the test page:

```json
{
  "tool": "debug_run_script_diagnostics",
  "arguments": {}
}
```

Returns file/line/column/code/message for TypeScript errors in `assets/` scripts, filtering out `node_modules/` and engine declarations.

## Manage Tool Configuration

1. Open the **Tools** tab in the panel
2. Create or select a configuration
3. Toggle individual tools on/off with checkboxes
4. Changes apply immediately (no server restart needed)

## Generate MCP Config Files

1. In the **Server** tab, click **Generate .mcp.json** (for Claude Desktop / Cursor)
2. Or click **Generate opencode.json** (for OpenCode)
3. Config files are written to the project root

## Use the Browser Test Page

1. Start the MCP server
2. Open `http://127.0.0.1:{port}/skill-tester` in a browser
3. Select a tool category tab, fill parameters, click **Execute**
4. Copy result or save as JSON file

## Install Skills to AI Clients

1. Open the **Skills** tab
2. Toggle desired skills (auto-generated + custom)
3. Click **Install Skills** — writes SKILL.md files to `.claude/skills/cocoscli/`
