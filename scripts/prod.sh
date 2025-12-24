#!/bin/bash
# Production Deployment Script
# Backs up wrangler.toml, generates production config from .env, runs migrations, builds, and deploys

set -e  # Exit on error

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}=== Starting Production Deployment ===${NC}"

# Step 1: Check if .env file exists
echo -e "\n${YELLOW}[1/8] Checking for .env file...${NC}"

if [ ! -f ".env" ]; then
    echo -e "  ${RED}ERROR: .env file not found!${NC}"
    echo -e "  ${RED}Please copy .env.example to .env and fill in your production values${NC}"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

echo -e "  ${GREEN}.env file found${NC}"

# Step 2: Load environment variables from .env
echo -e "\n${YELLOW}[2/8] Loading environment variables...${NC}"

# Read .env file and export variables
while IFS='=' read -r key value; do
    # Skip empty lines and comments
    if [[ -n "$key" && ! "$key" =~ ^[[:space:]]*# ]]; then
        # Remove leading/trailing whitespace
        key=$(echo "$key" | xargs)
        value=$(echo "$value" | xargs)

        # Export variable
        export "$key=$value"
        echo -e "  ${CYAN}Loaded: $key = $value${NC}"
    fi
done < .env

# Validate required variables
REQUIRED_VARS=("WORKER_NAME" "DB_NAME" "DB_ID" "DO_SCRIPT_NAME")
MISSING_VARS=()

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ] || [ "${!var}" = "YOUR_DATABASE_ID" ] || [ "${!var}" = "your-database-id-here" ]; then
        MISSING_VARS+=("$var")
    fi
done

if [ ${#MISSING_VARS[@]} -gt 0 ]; then
    echo -e "  ${RED}ERROR: Missing or invalid environment variables:${NC}"
    for var in "${MISSING_VARS[@]}"; do
        echo -e "    ${RED}- $var${NC}"
    done
    echo -e "  ${RED}Please update your .env file with actual production values${NC}"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

echo -e "  ${GREEN}All required variables loaded successfully${NC}"

# Check for optional ACCOUNT_ID
HAS_ACCOUNT_ID=false
if [ -n "$ACCOUNT_ID" ]; then
    HAS_ACCOUNT_ID=true
    echo -e "  ${CYAN}Optional ACCOUNT_ID found: $ACCOUNT_ID${NC}"
else
    echo -e "  ${CYAN}ACCOUNT_ID not specified (will use default account)${NC}"
fi

# Step 3: Backup current wrangler.toml
echo -e "\n${YELLOW}[3/8] Backing up wrangler.toml...${NC}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="wrangler.toml.backup.$TIMESTAMP"

if cp wrangler.toml "$BACKUP_FILE"; then
    echo -e "  ${GREEN}Backup created: $BACKUP_FILE${NC}"
else
    echo -e "  ${RED}ERROR: Failed to backup wrangler.toml${NC}"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Step 4: Generate production wrangler.toml
echo -e "\n${YELLOW}[4/8] Generating production wrangler.toml...${NC}"

# Build the config with optional account_id
cat > wrangler.toml << EOF
name = "$WORKER_NAME"
main = "src/index.ts"
compatibility_date = "2024-12-22"
EOF

# Add account_id if specified
if [ "$HAS_ACCOUNT_ID" = true ]; then
    echo "account_id = \"$ACCOUNT_ID\"" >> wrangler.toml
fi

# Add the rest of the config
cat >> wrangler.toml << EOF

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "$DB_NAME"
database_id = "$DB_ID"

# Static assets
[assets]
directory = "./dist"
binding = "ASSETS"

# Durable Objects
[[durable_objects.bindings]]
name = "NOTE_SESSIONS"
class_name = "NoteSessionDurableObject"
script_name = "$DO_SCRIPT_NAME"

[[migrations]]
tag = "v1"
new_classes = ["NoteSessionDurableObject"]

# Cron trigger to clean up expired notes
[triggers]
crons = ["*/15 * * * *"]  # Run every 15 minutes
EOF

echo -e "  ${GREEN}Production wrangler.toml generated successfully${NC}"
if [ "$HAS_ACCOUNT_ID" = true ]; then
    echo -e "    ${CYAN}Account ID: $ACCOUNT_ID${NC}"
fi
echo -e "    ${CYAN}Worker: $WORKER_NAME${NC}"
echo -e "    ${CYAN}Database: $DB_NAME ($DB_ID)${NC}"
echo -e "    ${CYAN}DO Script: $DO_SCRIPT_NAME${NC}"

# Step 5: Run production database migrations
echo -e "\n${YELLOW}[5/8] Running production database migrations...${NC}"

if npm run db:migrate:prod 2>&1 | tee /tmp/migrate_prod_output.txt; then
    if grep -q "No migrations to apply" /tmp/migrate_prod_output.txt; then
        echo -e "  ${CYAN}No migrations to apply (database is up to date)${NC}"
    else
        echo -e "  ${GREEN}Migrations completed successfully${NC}"
    fi
else
    echo -e "  ${YELLOW}WARNING: Migration command failed${NC}"
    echo -e "  ${YELLOW}You may need to run migrations manually${NC}"
    echo -e "  ${CYAN}Continuing with build...${NC}"
fi

rm -f /tmp/migrate_prod_output.txt

# Step 6: Build the project
echo -e "\n${YELLOW}[6/8] Building project...${NC}"

if npm run build; then
    echo -e "  ${GREEN}Build completed successfully${NC}"
else
    echo -e "  ${RED}Build failed${NC}"
    echo -e "  ${YELLOW}Restoring backup wrangler.toml...${NC}"
    cp "$BACKUP_FILE" wrangler.toml
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Step 7: Deploy to Cloudflare
echo -e "\n${YELLOW}[7/8] Deploying to Cloudflare...${NC}"

if npm run deploy; then
    echo -e "  ${GREEN}Deployment completed successfully${NC}"
else
    echo -e "  ${RED}Deployment failed${NC}"
    echo -e "  ${YELLOW}Restoring backup wrangler.toml...${NC}"
    cp "$BACKUP_FILE" wrangler.toml
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Step 8: Restore original wrangler.toml and cleanup
echo -e "\n${YELLOW}[8/8] Restoring original wrangler.toml...${NC}"

if cp "$BACKUP_FILE" wrangler.toml; then
    echo -e "  ${GREEN}Original wrangler.toml restored${NC}"

    # Remove the backup file
    if rm "$BACKUP_FILE"; then
        echo -e "  ${GREEN}Backup file removed${NC}"
    else
        echo -e "  ${YELLOW}WARNING: Failed to remove backup file${NC}"
    fi
else
    echo -e "  ${YELLOW}WARNING: Failed to restore original wrangler.toml${NC}"
    echo -e "  ${YELLOW}You can manually restore from: $BACKUP_FILE${NC}"
fi

echo -e "\n${GREEN}=== Production Deployment Complete ===${NC}"
echo -e "\n${CYAN}Deployment Summary:${NC}"
if [ "$HAS_ACCOUNT_ID" = true ]; then
    echo -e "  ${WHITE}Account ID: $ACCOUNT_ID${NC}"
fi
echo -e "  ${WHITE}Worker Name: $WORKER_NAME${NC}"
echo -e "  ${WHITE}Database: $DB_NAME${NC}"
echo -e "  ${WHITE}Database ID: $DB_ID${NC}"
echo ""
