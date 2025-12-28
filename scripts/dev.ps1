# Robust dev server restart script
# Kills all processes on port 8787, runs migrations, builds the project, and starts dev server

Write-Host "`n=== Starting Dev Server Restart ===" -ForegroundColor Cyan

# Step 1: Kill all processes on port 8787
Write-Host "`n[1/4] Killing processes on port 8787..." -ForegroundColor Yellow

$maxAttempts = 3
$attempt = 0

while ($attempt -lt $maxAttempts) {
    $attempt++

    # Get all processes listening on port 8787
    $connections = netstat -ano | Select-String ":8787" | Select-String "LISTENING"

    if ($connections) {
        # Extract unique PIDs
        $processIds = $connections | ForEach-Object {
            if ($_ -match '\s+(\d+)\s*$') {
                $matches[1]
            }
        } | Select-Object -Unique

        Write-Host "  Attempt $attempt/$maxAttempts - Found $($processIds.Count) process(es)" -ForegroundColor Cyan

        foreach ($processId in $processIds) {
            try {
                Stop-Process -Id $processId -Force -ErrorAction Stop
                Write-Host "    Killed process $processId" -ForegroundColor Green
            }
            catch {
                Write-Host "    Failed to kill process $processId" -ForegroundColor Red
            }
        }

        # Wait a bit for processes to fully terminate
        Start-Sleep -Seconds 2
    }
    else {
        Write-Host "  No processes found on port 8787" -ForegroundColor Green
        break
    }
}

# Final verification
$stillRunning = netstat -ano | Select-String ":8787" | Select-String "LISTENING"
if ($stillRunning) {
    Write-Host "  WARNING: Some processes may still be running on port 8787" -ForegroundColor Red
    $stillRunning | ForEach-Object { Write-Host "    $_" -ForegroundColor Red }
}
else {
    Write-Host "  All processes on port 8787 terminated successfully" -ForegroundColor Green
}

# Step 2: Run database migrations
Write-Host "`n[2/4] Running database migrations..." -ForegroundColor Yellow

try {
    $migrateOutput = & powershell.exe -ExecutionPolicy Bypass -Command "npm run db:migrate" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  WARNING: Migration command failed with exit code $LASTEXITCODE" -ForegroundColor Yellow
        Write-Host $migrateOutput -ForegroundColor Yellow
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

# Step 3: Build the project
Write-Host "`n[3/4] Building project..." -ForegroundColor Yellow

try {
    $buildOutput = & powershell.exe -ExecutionPolicy Bypass -Command "npm run build" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  Build failed with exit code $LASTEXITCODE" -ForegroundColor Red
        Write-Host $buildOutput -ForegroundColor Red
        Write-Host "`n=== Dev Server Restart Failed ===" -ForegroundColor Red
        exit 1
    }
    Write-Host "  Build completed successfully" -ForegroundColor Green
}
catch {
    Write-Host "  Build failed: $_" -ForegroundColor Red
    Write-Host "`n=== Dev Server Restart Failed ===" -ForegroundColor Red
    exit 1
}

# Step 4: Start dev server
Write-Host "`n[4/4] Starting dev server in new window..." -ForegroundColor Yellow

# Start dev server in a new PowerShell window that stays open
# Use -ExecutionPolicy Bypass to allow npm scripts to run
$startInfo = New-Object System.Diagnostics.ProcessStartInfo
$startInfo.FileName = "powershell.exe"
$startInfo.Arguments = "-ExecutionPolicy Bypass -NoExit -Command `"cd '$PWD'; npm run dev`""
$startInfo.UseShellExecute = $true
$startInfo.WindowStyle = "Normal"

$process = [System.Diagnostics.Process]::Start($startInfo)

Write-Host "  Dev server process started (PID: $($process.Id))" -ForegroundColor Cyan

# Wait for server to start
Write-Host "  Waiting for server to start..." -ForegroundColor Cyan
Start-Sleep -Seconds 7

# Check if server is running
$serverCheck = netstat -ano | Select-String ":8787" | Select-String "LISTENING"
if ($serverCheck) {
    Write-Host "  Dev server is running on http://127.0.0.1:8787" -ForegroundColor Green
    Write-Host "`n=== Dev Server Restart Complete ===" -ForegroundColor Green
}
else {
    Write-Host "  WARNING: Could not verify server is running on port 8787" -ForegroundColor Yellow
    Write-Host "  Check the new PowerShell window for errors" -ForegroundColor Yellow
}
