#!/usr/bin/env bash
#
# acp.sh - Add Commit Push 一键脚本
#
# 作用：对【主仓库】及其【所有子模块 submodule】依次执行
#       git add -A  ->  git commit  ->  git push
#
# 执行流程：
#
#   acp.sh "提交说明"
#         |
#         v
#   1. 读取 .gitmodules，遍历每个 submodule
#         |-- git add -A
#         |-- 有暂存内容?  是 -> commit + push
#         |                 否 -> 跳过
#         |-- 必须先于主仓库提交，否则主仓库记录的是旧指针
#         v
#   2. 主仓库 git add -A（含 submodule 指针更新）
#         |-- 有暂存内容?  是 -> commit + push
#         |                 否 -> 跳过
#         v
#   3. 汇总成功/失败数量
#
# 用法：
#   bash acp.sh "你的提交说明"
#   ./acp.sh   "你的提交说明"
#
# 说明：
#   - 提交说明为必填，避免产生空提交
#   - 单个仓库失败不会中断其它仓库的处理
#   - 仅处理一层 submodule（当前 cocos-mcp-server）
#

set -uo pipefail

#---------------------------------------------------------------
# 单个仓库的 add commit push 流程
# 参数: $1=仓库绝对路径  $2=提交说明  $3=显示标签
# 返回: 0 成功或无变更跳过, 1 失败
#---------------------------------------------------------------
acp_repo() {
    local repo_dir="$1"
    local msg="$2"
    local label="$3"

    echo "==> [$label] $repo_dir"

    cd "$repo_dir" || { echo "    [错误] 无法进入目录"; return 1; }

    # 暂存全部变更
    if ! git add -A; then
        echo "    [错误] git add 失败"
        return 1
    fi

    # 无暂存内容则跳过（--quiet 在有差异时返回非 0）
    if git diff --cached --quiet; then
        echo "    [跳过] 无变更"
        return 0
    fi

    # 提交
    if ! git commit -m "$msg"; then
        echo "    [错误] git commit 失败"
        return 1
    fi

    # 推送：未配置上游时自动 git push -u origin <分支>
    local branch
    branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")

    if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
        if ! git push; then
            echo "    [错误] git push 失败"
            return 1
        fi
    else
        echo "    [信息] 当前分支未配置上游，执行 git push -u origin $branch"
        if ! git push -u origin "$branch"; then
            echo "    [错误] git push 失败"
            return 1
        fi
    fi

    echo "    [完成] 已提交并推送"
    return 0
}

#---------------------------------------------------------------
# 主流程
#---------------------------------------------------------------
main() {
    # 参数校验
    if [ $# -lt 1 ]; then
        echo "用法: bash acp.sh \"<提交说明>\""
        echo "示例: bash acp.sh \"修复某个 bug\""
        return 1
    fi

    local msg="$1"

    # 必须处于 git 仓库
    if ! git rev-parse --show-toplevel >/dev/null 2>&1; then
        echo "[错误] 当前目录不在任何 git 仓库中"
        return 1
    fi

    local root
    root=$(git rev-parse --show-toplevel)
    local failures=0

    echo "============================"
    echo " 提交说明: $msg"
    echo " 主仓库  : $root"
    echo "============================"

    # ---- 阶段 1：处理所有 submodule（必须先于主仓库）----
    echo ""
    echo "[阶段 1/2] 处理 submodule"
    echo "--------------------------"

    local modules_file="$root/.gitmodules"
    if [ -f "$modules_file" ]; then
        # 读取 .gitmodules 中所有 submodule 的 path
        local paths
        paths=$(git config --file "$modules_file" --get-regexp '\.path$' 2>/dev/null | awk '{print $2}')
        if [ -n "$paths" ]; then
            while IFS= read -r sm_path; do
                [ -z "$sm_path" ] && continue
                acp_repo "$root/$sm_path" "$msg" "submodule: $sm_path" || failures=$((failures + 1))
            done <<< "$paths"
        else
            echo "（.gitmodules 中未发现 submodule 记录）"
        fi
    else
        echo "（未发现 .gitmodules，跳过 submodule）"
    fi

    # ---- 阶段 2：处理主仓库 ----
    echo ""
    echo "[阶段 2/2] 处理主仓库"
    echo "--------------------------"
    acp_repo "$root" "$msg" "主仓库" || failures=$((failures + 1))

    # ---- 汇总 ----
    echo ""
    echo "============================"
    if [ "$failures" -eq 0 ]; then
        echo " [全部完成] 所有仓库处理成功"
    else
        echo " [警告] 有 $failures 个仓库处理失败，请查看上方日志"
    fi
    echo "============================"

    return "$failures"
}

main "$@"
