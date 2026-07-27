#!/usr/bin/env bash
#
# acpExample.sh - acp.sh 的自检与示例
#
# 作用：对 acp.sh 做非破坏性自检（不会执行 add/commit/push）
#       1. 检查 acp.sh 语法是否正确
#       2. 检查当前是否处于 git 仓库
#       3. 列出将被处理的仓库（主仓库 + 所有 submodule）
#       4. 打印使用示例
#
# 用法：
#   bash acpExample.sh
#

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ACP="$SCRIPT_DIR/acp.sh"

echo "============================"
echo " acp.sh 自检（只读，不会推送）"
echo "============================"

# 1. 语法检查
echo "[1/4] 检查 acp.sh 语法 ..."
if bash -n "$ACP"; then
    echo "    [通过] 语法正确"
else
    echo "    [失败] 语法错误，请检查 acp.sh"
    exit 1
fi

# 2. git 仓库检查
echo "[2/4] 检查 git 仓库 ..."
if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
    echo "    [失败] 当前不在 git 仓库中，请在仓库目录下运行"
    exit 1
fi
ROOT="$(git rev-parse --show-toplevel)"
echo "    [通过] 主仓库: $ROOT"

# 3. 列出将被处理的仓库
echo "[3/4] 列出将被 acp.sh 处理的仓库 ..."
echo "    - 主仓库: $ROOT"
if [ -f "$ROOT/.gitmodules" ]; then
    paths=$(git config --file "$ROOT/.gitmodules" --get-regexp '\.path$' 2>/dev/null | awk '{print $2}')
    if [ -n "$paths" ]; then
        while IFS= read -r p; do
            [ -z "$p" ] && continue
            echo "    - submodule: $p"
        done <<< "$paths"
    else
        echo "    - （.gitmodules 中无 submodule）"
    fi
else
    echo "    - （无 .gitmodules）"
fi

# 4. 使用示例
echo "[4/4] 使用示例 ..."
cat <<'EOF'
    正常用法（在仓库根目录执行）：
        bash acp.sh "修复某个 bug"

    无变更时的安全行为：
        若所有仓库均无变更，脚本会全部跳过，不产生提交、不推送。

    真实测试建议：
        先在某个文件加一行注释，再运行：
            bash acp.sh "测试提交"
        观察主仓库与 submodule 是否都被正确提交并推送。
EOF

echo ""
echo "[完成] 自检通过，可以开始使用 acp.sh"
