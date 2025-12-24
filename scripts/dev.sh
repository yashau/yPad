#!/bin/bash
# Robust dev server restart script
# Kills all processes on port 8787, runs migrations, builds the project, and starts dev server

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}=== Starting Dev Server Restart ===${NC}"

# Step 1: Kill all processes on port 8787
echo -e "\n${YELLOW}[1/4] Killing processes on port 8787...${NC}"

MAX_ATTEMPTS=3
ATTEMPT=0

while [ $ATTEMPT -lt $MAX_ATTEMPTS ]; do
    ATTEMPT=$((ATTEMPT + 1))

    # Find processes using port 8787
    PIDS=$(lsof -ti:8787 2>/dev/null || true)

    if [ -n "$PIDS" ]; then
        COUNT=$(echo "$PIDS" | wc -w)
        echo -e "  Attempt $ATTEMPT/$MAX_ATTEMPTS - Found $COUNT process(es)"

        for PID in $PIDS; do
            if kill -9 "$PID" 2>/dev/null; then
                echo -e "  ${GREEN}Killed process $PID${NC}"
            else
                echo -e "  ${RED}Failed to kill process $PID${NC}"
            fi
        done

        sleep 2
    else
        echo -e "  ${GREEN}No processes found on port 8787${NC}"
        break
    fi
done

# Final verification
STILL_RUNNING=$(lsof -ti:8787 2>/dev/null || true)
if [ -n "$STILL_RUNNING" ]; then
    echo -e "  ${RED}WARNING: Some processes may still be running on port 8787${NC}"
    echo "$STILL_RUNNING" | while read -r line; do
        echo -e "    ${RED}$line${NC}"
    done
else
    echo -e "  ${GREEN}All processes on port 8787 terminated successfully${NC}"
fi

# Step 2: Run database migrations
echo -e "\n${YELLOW}[2/4] Running database migrations...${NC}"

if npm run db:migrate 2>&1 | tee /tmp/migrate_output.txt; then
    if grep -q "No migrations to apply" /tmp/migrate_output.txt; then
        echo -e "  ${CYAN}No migrations to apply (database is up to date)${NC}"
    else
        echo -e "  ${GREEN}Migrations completed successfully${NC}"
    fi
else
    echo -e "  ${YELLOW}WARNING: Migration command failed${NC}"
    echo -e "  ${CYAN}Continuing with build...${NC}"
fi

rm -f /tmp/migrate_output.txt

# Step 3: Build the project
echo -e "\n${YELLOW}[3/4] Building project...${NC}"

if npm run build; then
    echo -e "  ${GREEN}Build completed successfully${NC}"
else
    echo -e "  ${RED}Build failed${NC}"
    echo -e "\n${RED}=== Dev Server Restart Failed ===${NC}"
    exit 1
fi

# Step 4: Start dev server
echo -e "\n${YELLOW}[4/4] Starting dev server...${NC}"

# Check if running in a terminal that supports background processes
if [ -t 0 ]; then
    # Start dev server in background
    npm run dev &
    DEV_PID=$!
    echo -e "  ${CYAN}Dev server process started (PID: $DEV_PID)${NC}"

    # Wait for server to start
    echo -e "  ${CYAN}Waiting for server to start...${NC}"
    sleep 7

    # Check if server is running
    if lsof -ti:8787 >/dev/null 2>&1; then
        echo -e "  ${GREEN}Dev server is running on http://127.0.0.1:8787${NC}"
        echo -e "\n${GREEN}=== Dev Server Restart Complete ===${NC}"
        echo -e "\n${CYAN}Server is running in the background (PID: $DEV_PID)${NC}"
        echo -e "${CYAN}To stop it, run: kill $DEV_PID${NC}"
    else
        echo -e "  ${YELLOW}WARNING: Could not verify server is running on port 8787${NC}"
    fi
else
    # Not in a terminal, just run dev server
    echo -e "  ${CYAN}Starting dev server...${NC}"
    npm run dev
fi
