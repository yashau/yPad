# Production Deployment Script
# Backs up wrangler.toml, generates production config from .env, runs migrations, builds, and deploys

Write-Host "`n=== Starting Production Deployment ===" -ForegroundColor Cyan

# Step 1: Check if .env file exists
Write-Host "`n[1/8] Checking for .env file..." -ForegroundColor Yellow

if (-not (Test-Path ".env")) {
    Write-Host "  ERROR: .env file not found!" -ForegroundColor Red
    Write-Host "  Please copy .env.example to .env and fill in your production values" -ForegroundColor Red
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

Write-Host "  .env file found" -ForegroundColor Green

# Step 2: Load environment variables from .env
Write-Host "`n[2/8] Loading environment variables..." -ForegroundColor Yellow

$envVars = @{}
Get-Content ".env" | ForEach-Object {
    $line = $_.Trim()
    # Skip empty lines and comments
    if ($line -and -not $line.StartsWith("#")) {
        $parts = $line -split "=", 2
        if ($parts.Length -eq 2) {
            $key = $parts[0].Trim()
            $value = $parts[1].Trim()
            $envVars[$key] = $value
            Write-Host "  Loaded: $key = $value" -ForegroundColor Cyan
        }
    }
}

# Validate required variables
$requiredVars = @("WORKER_NAME", "DB_NAME", "DB_ID", "DO_SCRIPT_NAME")
$missingVars = @()

foreach ($var in $requiredVars) {
    if (-not $envVars.ContainsKey($var) -or $envVars[$var] -eq "YOUR_DATABASE_ID" -or $envVars[$var] -eq "your-database-id-here") {
        $missingVars += $var
    }
}

if ($missingVars.Count -gt 0) {
    Write-Host "  ERROR: Missing or invalid environment variables:" -ForegroundColor Red
    foreach ($var in $missingVars) {
        Write-Host "    - $var" -ForegroundColor Red
    }
    Write-Host "  Please update your .env file with actual production values" -ForegroundColor Red
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

Write-Host "  All required variables loaded successfully" -ForegroundColor Green

# Check for optional ACCOUNT_ID
$hasAccountId = $false
if ($envVars.ContainsKey("ACCOUNT_ID") -and $envVars["ACCOUNT_ID"] -and $envVars["ACCOUNT_ID"] -ne "") {
    $hasAccountId = $true
    Write-Host "  Optional ACCOUNT_ID found: $($envVars['ACCOUNT_ID'])" -ForegroundColor Cyan
}
else {
    Write-Host "  ACCOUNT_ID not specified (will use default account)" -ForegroundColor Cyan
}

# Step 3: Backup current wrangler.toml
Write-Host "`n[3/8] Backing up wrangler.toml..." -ForegroundColor Yellow

$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$backupFile = "wrangler.toml.backup.$timestamp"

try {
    Copy-Item "wrangler.toml" $backupFile -ErrorAction Stop
    Write-Host "  Backup created: $backupFile" -ForegroundColor Green
}
catch {
    Write-Host "  ERROR: Failed to backup wrangler.toml: $_" -ForegroundColor Red
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

# Step 4: Generate production wrangler.toml
Write-Host "`n[4/8] Generating production wrangler.toml..." -ForegroundColor Yellow

# Build the config with optional account_id
$wranglerConfig = "name = `"$($envVars['WORKER_NAME'])`"`n"
$wranglerConfig += "main = `"src/index.ts`"`n"
$wranglerConfig += "compatibility_date = `"2024-12-22`"`n"

# Add account_id if specified
if ($hasAccountId) {
    $wranglerConfig += "account_id = `"$($envVars['ACCOUNT_ID'])`"`n"
}

$wranglerConfig += @"

# D1 Database
[[d1_databases]]
binding = "DB"
database_name = "$($envVars['DB_NAME'])"
database_id = "$($envVars['DB_ID'])"

# Static assets
[assets]
directory = "./dist"
binding = "ASSETS"

# Durable Objects
[[durable_objects.bindings]]
name = "NOTE_SESSIONS"
class_name = "NoteSessionDurableObject"
script_name = "$($envVars['DO_SCRIPT_NAME'])"

[[migrations]]
tag = "v1"
new_classes = ["NoteSessionDurableObject"]

# Cron trigger to clean up expired notes
[triggers]
crons = ["*/15 * * * *"]  # Run every 15 minutes
"@

try {
    Set-Content "wrangler.toml" $wranglerConfig -ErrorAction Stop
    Write-Host "  Production wrangler.toml generated successfully" -ForegroundColor Green
    if ($hasAccountId) {
        Write-Host "    Account ID: $($envVars['ACCOUNT_ID'])" -ForegroundColor Cyan
    }
    Write-Host "    Worker: $($envVars['WORKER_NAME'])" -ForegroundColor Cyan
    Write-Host "    Database: $($envVars['DB_NAME']) ($($envVars['DB_ID']))" -ForegroundColor Cyan
    Write-Host "    DO Script: $($envVars['DO_SCRIPT_NAME'])" -ForegroundColor Cyan
}
catch {
    Write-Host "  ERROR: Failed to write wrangler.toml: $_" -ForegroundColor Red
    Write-Host "  Restoring backup..." -ForegroundColor Yellow
    Copy-Item $backupFile "wrangler.toml" -Force
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

# Step 5: Run production database migrations
Write-Host "`n[5/8] Running production database migrations..." -ForegroundColor Yellow

try {
    $migrateOutput = & npm run db:migrate:prod 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Migration command failed with exit code $LASTEXITCODE" -ForegroundColor Yellow
        Write-Host $migrateOutput -ForegroundColor Yellow
        Write-Host "  You may need to run migrations manually" -ForegroundColor Yellow
        Write-Host "  Continuing with build..." -ForegroundColor Cyan
    }
    else {
        # Check if there were no migrations or if migrations applied
        if ($migrateOutput -match "No migrations to apply") {
            Write-Host "  No migrations to apply (database is up to date)" -ForegroundColor Cyan
        }
        else {
            Write-Host "  Migrations completed successfully" -ForegroundColor Green
        }
    }
}
catch {
    Write-Host "  WARNING: Migration check failed: $_" -ForegroundColor Yellow
    Write-Host "  Continuing with build..." -ForegroundColor Cyan
}

# Step 6: Build the project
Write-Host "`n[6/8] Building project..." -ForegroundColor Yellow

try {
    $buildOutput = & npm run build 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host $buildOutput -ForegroundColor Red
        Write-Host "  Restoring backup wrangler.toml..." -ForegroundColor Yellow
        Copy-Item $backupFile "wrangler.toml" -Force
        Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Build completed successfully" -ForegroundColor Green
}
catch {
    Write-Host "  Build failed: $_" -ForegroundColor Red
    Write-Host "  Restoring backup wrangler.toml..." -ForegroundColor Yellow
    Copy-Item $backupFile "wrangler.toml" -Force
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

# Step 7: Deploy to Cloudflare
Write-Host "`n[7/8] Deploying to Cloudflare..." -ForegroundColor Yellow

try {
    $deployOutput = & npm run deploy 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Deployment failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host $deployOutput -ForegroundColor Red
        Write-Host "  Restoring backup wrangler.toml..." -ForegroundColor Yellow
        Copy-Item $backupFile "wrangler.toml" -Force
        Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Deployment completed successfully" -ForegroundColor Green
    Write-Host $deployOutput -ForegroundColor Cyan
}
catch {
    Write-Host "  Deployment failed: $_" -ForegroundColor Red
    Write-Host "  Restoring backup wrangler.toml..." -ForegroundColor Yellow
    Copy-Item $backupFile "wrangler.toml" -Force
    Write-Host "`n=== Deployment Failed ===" -ForegroundColor Red
    exit 1
}

# Step 8: Restore original wrangler.toml and cleanup
Write-Host "`n[8/8] Restoring original wrangler.toml..." -ForegroundColor Yellow

try {
    Copy-Item $backupFile "wrangler.toml" -Force -ErrorAction Stop
    Write-Host "  Original wrangler.toml restored" -ForegroundColor Green

    # Remove the backup file
    Remove-Item $backupFile -Force -ErrorAction Stop
    Write-Host "  Backup file removed" -ForegroundColor Green
}
catch {
    Write-Host "  WARNING: Failed to restore original wrangler.toml or cleanup backup" -ForegroundColor Yellow
    Write-Host "  You can manually restore from: $backupFile" -ForegroundColor Yellow
}

Write-Host "`n=== Production Deployment Complete ===" -ForegroundColor Green
Write-Host "`nDeployment Summary:" -ForegroundColor Cyan
if ($hasAccountId) {
    Write-Host "  Account ID: $($envVars['ACCOUNT_ID'])" -ForegroundColor White
}
Write-Host "  Worker Name: $($envVars['WORKER_NAME'])" -ForegroundColor White
Write-Host "  Database: $($envVars['DB_NAME'])" -ForegroundColor White
Write-Host "  Database ID: $($envVars['DB_ID'])" -ForegroundColor White
Write-Host ""
