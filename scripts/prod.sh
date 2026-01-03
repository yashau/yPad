#!/bin/bash
# Production Deployment Script
# Backs up wrangler.toml, generates production config from .env, runs migrations, builds, and deploys

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

echo -e "\n${CYAN}=== Starting Production Deployment ===${NC}"

# Retry configuration for Cloudflare API operations
MAX_RETRIES=3
RETRY_DELAY=2

# Step 1: Check if .env file exists
echo -e "\n${YELLOW}[1/9] Checking for .env file...${NC}"

if [ ! -f ".env" ]; then
    echo -e "  ${RED}ERROR: .env file not found!${NC}"
    echo -e "  ${RED}Please copy .env.example to .env and fill in your production values${NC}"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

echo -e "  ${GREEN}.env file found${NC}"

# Step 2: Load environment variables from .env
echo -e "\n${YELLOW}[2/9] Loading environment variables...${NC}"

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
echo -e "\n${YELLOW}[3/9] Backing up wrangler.toml...${NC}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="wrangler.toml.backup.$TIMESTAMP"

if cp wrangler.toml "$BACKUP_FILE"; then
    echo -e "  ${GREEN}Backup created: $BACKUP_FILE${NC}"
else
    echo -e "  ${RED}ERROR: Failed to backup wrangler.toml${NC}"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Function to remove backup file
remove_backup_file() {
    if [ -f "$BACKUP_FILE" ]; then
        if rm "$BACKUP_FILE"; then
            echo -e "  ${GREEN}Backup file cleaned up${NC}"
        else
            echo -e "  ${YELLOW}WARNING: Failed to cleanup backup file: $BACKUP_FILE${NC}"
        fi
    fi
}

# Function to restore backup
restore_backup() {
    local reason="$1"

    if [ -n "$reason" ]; then
        echo -e "  ${RED}$reason${NC}"
    fi
    echo -e "  ${YELLOW}Restoring backup wrangler.toml...${NC}"
    if cp "$BACKUP_FILE" wrangler.toml; then
        echo -e "  ${GREEN}Original wrangler.toml restored${NC}"
    else
        echo -e "  ${RED}ERROR: Failed to restore backup. Manual restore required from: $BACKUP_FILE${NC}"
    fi
    remove_backup_file
}

# Step 4: Generate production wrangler.toml
echo -e "\n${YELLOW}[4/9] Generating production wrangler.toml...${NC}"

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

[[durable_objects.bindings]]
name = "RATE_LIMITER"
class_name = "RateLimiterDurableObject"
script_name = "$DO_SCRIPT_NAME"

[[migrations]]
tag = "v1"
new_classes = ["NoteSessionDurableObject"]

[[migrations]]
tag = "v2"
new_classes = ["RateLimiterDurableObject"]

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

# Step 5: Run production database migrations with retry
echo -e "\n${YELLOW}[5/9] Running production database migrations...${NC}"

MIGRATION_SUCCESS=false

for ((attempt=1; attempt<=MAX_RETRIES; attempt++)); do
    if [ $attempt -gt 1 ]; then
        echo -e "  ${CYAN}Retry attempt $attempt of $MAX_RETRIES...${NC}"
        sleep $RETRY_DELAY
    fi

    if npm run db:migrate:prod 2>&1 | tee /tmp/migrate_prod_output.txt; then
        if grep -q "No migrations to apply" /tmp/migrate_prod_output.txt; then
            echo -e "  ${CYAN}No migrations to apply (database is up to date)${NC}"
        else
            echo -e "  ${GREEN}Migrations completed successfully${NC}"
        fi
        MIGRATION_SUCCESS=true
        break
    else
        if [ $attempt -lt $MAX_RETRIES ]; then
            echo -e "  ${YELLOW}Migration attempt $attempt failed${NC}"
        fi
    fi
done

rm -f /tmp/migrate_prod_output.txt

if [ "$MIGRATION_SUCCESS" = false ]; then
    echo -e "  ${YELLOW}WARNING: Migration failed after $MAX_RETRIES attempts${NC}"
    echo -e "  ${YELLOW}You may need to run migrations manually${NC}"
    echo -e "  ${CYAN}Continuing with build...${NC}"
fi

# Step 6: Inject environment variables into constants.ts
echo -e "\n${YELLOW}[6/9] Injecting environment variables into constants.ts...${NC}"

CONSTANTS_FILE="config/constants.ts"
CONSTANTS_BACKUP="config/constants.ts.backup"

# Backup constants.ts
if cp "$CONSTANTS_FILE" "$CONSTANTS_BACKUP"; then
    echo -e "  ${GREEN}Backed up constants.ts${NC}"
else
    echo -e "  ${RED}ERROR: Failed to backup constants.ts${NC}"
    restore_backup "Failed to backup constants.ts"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Replace ABUSE_EMAIL with value from .env
if [ -n "$ABUSE_EMAIL" ]; then
    sed -i "s|ABUSE_EMAIL: '.*'|ABUSE_EMAIL: '$ABUSE_EMAIL'|g" "$CONSTANTS_FILE"
    echo -e "  ${GREEN}Injected ABUSE_EMAIL: $ABUSE_EMAIL${NC}"
else
    echo -e "  ${YELLOW}WARNING: ABUSE_EMAIL not set in .env, using default${NC}"
fi

# Step 7: Build the project
echo -e "\n${YELLOW}[7/9] Building project...${NC}"

if npm run build; then
    echo -e "  ${GREEN}Build completed successfully${NC}"
else
    echo -e "  ${RED}Build failed${NC}"
    # Restore constants.ts
    cp "$CONSTANTS_BACKUP" "$CONSTANTS_FILE"
    rm -f "$CONSTANTS_BACKUP"
    restore_backup "Build failed"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Restore original constants.ts after build
echo -e "\n${YELLOW}Restoring original constants.ts...${NC}"
if cp "$CONSTANTS_BACKUP" "$CONSTANTS_FILE"; then
    echo -e "  ${GREEN}Original constants.ts restored${NC}"
    rm -f "$CONSTANTS_BACKUP"
else
    echo -e "  ${YELLOW}WARNING: Failed to restore constants.ts${NC}"
fi

# Step 8: Deploy to Cloudflare with retry
echo -e "\n${YELLOW}[8/9] Deploying to Cloudflare...${NC}"

DEPLOYMENT_SUCCESS=false

for ((attempt=1; attempt<=MAX_RETRIES; attempt++)); do
    if [ $attempt -gt 1 ]; then
        echo -e "  ${CYAN}Retry attempt $attempt of $MAX_RETRIES...${NC}"
        sleep $RETRY_DELAY
    fi

    if npx wrangler deploy 2>&1 | tee /tmp/deploy_output.txt; then
        echo -e "  ${GREEN}Deployment completed successfully${NC}"
        cat /tmp/deploy_output.txt
        DEPLOYMENT_SUCCESS=true
        break
    else
        if [ $attempt -lt $MAX_RETRIES ]; then
            echo -e "  ${YELLOW}Deployment attempt $attempt failed${NC}"
        fi
    fi
done

rm -f /tmp/deploy_output.txt

if [ "$DEPLOYMENT_SUCCESS" = false ]; then
    echo -e "  ${RED}Deployment failed after $MAX_RETRIES attempts${NC}"
    restore_backup "Deployment failed"
    echo -e "\n${RED}=== Deployment Failed ===${NC}"
    exit 1
fi

# Step 9: Restore original wrangler.toml and cleanup
echo -e "\n${YELLOW}[9/9] Restoring original wrangler.toml...${NC}"

if cp "$BACKUP_FILE" wrangler.toml; then
    echo -e "  ${GREEN}Original wrangler.toml restored${NC}"
else
    echo -e "  ${YELLOW}WARNING: Failed to restore original wrangler.toml${NC}"
    echo -e "  ${YELLOW}You can manually restore from: $BACKUP_FILE${NC}"
fi

remove_backup_file

echo -e "\n${GREEN}=== Production Deployment Complete ===${NC}"
echo -e "\n${CYAN}Deployment Summary:${NC}"
if [ "$HAS_ACCOUNT_ID" = true ]; then
    echo -e "  ${WHITE}Account ID: $ACCOUNT_ID${NC}"
fi
echo -e "  ${WHITE}Worker Name: $WORKER_NAME${NC}"
echo -e "  ${WHITE}Database: $DB_NAME${NC}"
echo -e "  ${WHITE}Database ID: $DB_ID${NC}"
echo ""
