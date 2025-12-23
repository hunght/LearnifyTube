#!/bin/bash
set -euo pipefail

# Restart LearnifyTube project cleanly:
# - Kills related Electron/Vite processes
# - Clears Vite caches
# - Optionally starts the dev app (with --start)

usage() {
    echo "Usage: $0 [--start]" >&2
}

START_APP=false
if [[ $# -gt 0 ]]; then
    case "${1:-}" in
        --start) START_APP=true ;;
        -h|--help) usage; exit 0 ;;
        *) echo "Unknown option: $1" >&2; usage; exit 1 ;;
    esac
fi

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

APP_NAME="LearnifyTube"

echo -e "${BLUE}🔍 Looking for running processes...${NC}"

kill_by_pids() {
    local pids="$1" desc="$2"
    if [[ -n "$pids" ]]; then
        echo -e "${YELLOW}📦 Found $desc: $pids${NC}"
        for pid in $pids; do
            echo -e "${RED}🔪 Killing $desc PID $pid${NC}"
            kill -TERM "$pid" 2>/dev/null || true
            sleep 0.5
            if kill -0 "$pid" 2>/dev/null; then
                echo -e "${RED}💀 Force killing $desc PID $pid${NC}"
                kill -KILL "$pid" 2>/dev/null || true
            fi
        done
    else
        echo -e "${GREEN}✅ No $desc found${NC}"
    fi
}

kill_by_name() {
    local name="$1"
    local pids
    pids=$(pgrep -f "$name" 2>/dev/null || true)
    kill_by_pids "$pids" "$name processes"
}

kill_by_pattern() {
    local pattern="$1" desc="$2"
    local pids
    pids=$(ps aux | grep -i "$pattern" | grep -v grep | awk '{print $2}' || true)
    kill_by_pids "$pids" "$desc"
}

echo -e "${BLUE}🎯 Killing Electron-related processes...${NC}"
kill_by_name "$APP_NAME"
kill_by_pattern "electron.*$APP_NAME" "Electron $APP_NAME"
kill_by_pattern "\\.vite/build/main\\.js" ".vite main process"
kill_by_pattern "electron-forge start" "electron-forge"
kill_by_pattern "vite.*electron" "Vite electron dev server"

echo -e "${BLUE}🧹 Clearing caches...${NC}"
if [[ -d node_modules/.vite ]]; then
    rm -rf node_modules/.vite
    echo -e "${GREEN}✅ Cleared node_modules/.vite${NC}"
else
    echo -e "${YELLOW}ℹ️  No node_modules/.vite cache${NC}"
fi

if [[ -d .vite ]]; then
    rm -rf .vite
    echo -e "${GREEN}✅ Cleared .vite${NC}"
fi

if [[ -d dist-electron ]]; then
    rm -rf dist-electron
    echo -e "${GREEN}✅ Cleared dist-electron${NC}"
fi

sleep 1

remaining=$(pgrep -f "$APP_NAME" 2>/dev/null || true)
if [[ -n "$remaining" ]]; then
    echo -e "${YELLOW}⚠️  Some $APP_NAME processes may still be running: $remaining${NC}"
else
    echo -e "${GREEN}✅ All $APP_NAME processes terminated${NC}"
fi

if $START_APP; then
    echo -e "${BLUE}🚀 Starting dev app...${NC}"
    npm run dev
else
    echo -e "${BLUE}✅ Ready. Run 'npm run dev' or 'npm start' to launch.${NC}"
fi
