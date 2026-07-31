#!/usr/bin/env bash
#
# check-ts.sh - 检查 CocosMCP 项目的 TypeScript 脚本语法/类型
#
# 作用：用 tsc --noEmit 检查 assets 下的用户脚本，不产出文件。
#
# 为什么要单独的配置（CocosMCP/tsconfig.check.json）：
#   - skipLibCheck：跳过 Cocos 引擎自带 .d.ts（cc.d.ts/jsb.d.ts）在新 tsc 下的噪音报错
#   - exclude：排除 extensions（扩展有自己的 tsconfig）/ library / temp 等，避免误查
#
# 执行流程：
#   check-ts.sh
#     |-- 先 find assets 下的 .ts，无则跳过（避免 tsc 报 TS18003）
#     |-- 优先用 cocos-mcp-server 已装的 tsc
#     '-- 找不到则 npx typescript 临时下载
#         '-- tsc --noEmit -p CocosMCP/tsconfig.check.json
#
# 用法：
#   bash check-ts.sh
#   退出码 0 = 无错误（或无可检查脚本）；非 0 = 有语法/类型错误（见输出）
#

set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

# assets 下无 .ts 时直接跳过（避免 tsc TS18003）
ts_count=$(find CocosMCP/assets -name "*.ts" 2>/dev/null | wc -l)
if [ "$ts_count" -eq 0 ]; then
    echo "[check-ts] assets 下无 .ts 脚本，跳过检查"
    exit 0
fi

TSC="cocos-mcp-server/node_modules/.bin/tsc"
if [ -x "$TSC" ]; then
    "$TSC" --noEmit -p CocosMCP/tsconfig.check.json
else
    echo "[check-ts] 未找到本地 tsc（cocos-mcp-server 未 npm install），改用 npx typescript"
    npx --yes -p typescript tsc --noEmit -p CocosMCP/tsconfig.check.json
fi
