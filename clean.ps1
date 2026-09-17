<#
.SYNOPSIS
    Vercel Storage Cleaner (PowerShell)
    Safely purges inactive historical deployments across all Vercel projects.

.PARAMETER DryRun
    If set, only previews deployments that would be deleted without actually deleting them.

.PARAMETER Token
    Optional custom Vercel API token. If omitted, it automatically reads the token from Vercel CLI.

.EXAMPLE
    .\clean.ps1
    .\clean.ps1 -DryRun
#>

[CmdletBinding()]
param (
    [switch]$DryRun,
    [string]$Token = ""
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "       🚀 VERCEL STORAGE CLEANER & PURGER 🚀" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Resolve Token
if (-not $Token) {
    if ($env:VERCEL_TOKEN) {
        $Token = $env:VERCEL_TOKEN
    } else {
        $winCliPath = "$env:APPDATA\com.vercel.cli\Data\auth.json"
        $homeCliPath = "$env:USERPROFILE\.vercel\auth.json"

        if (Test-Path $winCliPath) {
            try {
                $auth = Get-Content $winCliPath -Raw | ConvertFrom-Json
                $Token = $auth.token
            } catch {}
        } elseif (Test-Path $homeCliPath) {
            try {
                $auth = Get-Content $homeCliPath -Raw | ConvertFrom-Json
                $Token = $auth.token
            } catch {}
        }
    }
}

if (-not $Token) {
    Write-Host "[ERROR] No Vercel authentication token found!" -ForegroundColor Red
    Write-Host "Please run 'npx vercel login' or set `$env:VERCEL_TOKEN='...'`" -ForegroundColor Yellow
    exit 1
}

$headers = @{
    "Authorization" = "Bearer $Token"
    "User-Agent"    = "Vercel-Storage-Cleaner/1.0.0"
}

# 2. Verify User
try {
    $userRes = Invoke-RestMethod -Uri "https://api.vercel.com/v2/user" -Headers $headers -Method Get
    Write-Host "✔ Authenticated as: $($userRes.user.username) ($($userRes.user.email))`n" -ForegroundColor Green
} catch {
    Write-Host "[ERROR] Authentication failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($DryRun) {
    Write-Host "[MODE] DRY RUN ENABLED - No deployments will be deleted.`n" -ForegroundColor Cyan
}

# 3. Fetch Projects
Write-Host "Fetching all projects in your account..." -ForegroundColor Gray
$allProjects = @()
$nextUrl = "https://api.vercel.com/v9/projects?limit=100"

while ($nextUrl) {
    $res = Invoke-RestMethod -Uri $nextUrl -Headers $headers -Method Get
    if ($res.projects) {
        $allProjects += $res.projects
    }
    if ($res.pagination -and $res.pagination.next) {
        $nextUrl = "https://api.vercel.com/v9/projects?limit=100&until=$($res.pagination.next)"
    } else {
        $nextUrl = $null
    }
}

Write-Host "Found $($allProjects.Count) projects.`n" -ForegroundColor Green

$totalScanned = 0
$totalDeleted = 0
$totalRetained = 0
$totalErrors = 0

# 4. Iterate and Clean
foreach ($project in $allProjects) {
    $activeProdId = $project.targets.production.id
    
    # Fetch all deployments for this project
    $deployments = @()
    $depUrl = "https://api.vercel.com/v6/deployments?projectId=$($project.id)&limit=100"
    while ($depUrl) {
        $res = Invoke-RestMethod -Uri $depUrl -Headers $headers -Method Get
        if ($res.deployments) {
            $deployments += $res.deployments
        }
        if ($res.pagination -and $res.pagination.next) {
            $depUrl = "https://api.vercel.com/v6/deployments?projectId=$($project.id)&limit=100&until=$($res.pagination.next)"
        } else {
            $depUrl = $null
        }
    }

    $totalScanned += $deployments.Count
    $deletable = $deployments | Where-Object { $_.uid -ne $activeProdId -and $_.state -ne "DELETED" }
    $deletableCount = if ($deletable) { $deletable.Count } else { 0 }
    $retainedCount = $deployments.Count - $deletableCount
    $totalRetained += $retainedCount

    Write-Host "📁 $($project.name)" -ForegroundColor White
    Write-Host "   Total deployments: $($deployments.Count) | Protected (Active): $retainedCount | Deletable: $deletableCount" -ForegroundColor Gray

    $projectDeleted = 0

    if ($deletableCount -gt 0) {
        foreach ($dep in $deletable) {
            if ($DryRun) {
                Write-Host "   [DRY-RUN] Would delete: $($dep.uid) ($($dep.url))" -ForegroundColor DarkGray
                $projectDeleted++
            } else {
                $deleted = $false
                $attempts = 0
                while (-not $deleted -and $attempts -lt 4) {
                    $attempts++
                    try {
                        Invoke-RestMethod -Uri "https://api.vercel.com/v13/deployments/$($dep.uid)" -Method Delete -Headers $headers | Out-Null
                        $deleted = $true
                        $projectDeleted++
                        $totalDeleted++
                        Write-Host "`r   🧹 Purged: $projectDeleted / $deletableCount deployments..." -NoNewline -ForegroundColor Yellow
                        Start-Sleep -Milliseconds 150
                    } catch {
                        if ($_.Exception.Message -match "429") {
                            Write-Host "`n   [RATE LIMIT] Hit Vercel 429. Waiting 15s..." -ForegroundColor DarkYellow
                            Start-Sleep -Seconds 15
                        } else {
                            $totalErrors++
                            Write-Host "`n   ✖ Failed to delete $($dep.uid): $($_.Exception.Message)" -ForegroundColor Red
                            break
                        }
                    }
                }
            }
        }
        if (-not $DryRun) {
            Write-Host "`r   ✔ Purged all $projectDeleted inactive deployments!          " -ForegroundColor Green
        }
    } else {
        Write-Host "   ✔ Already clean! Only active production deployment stored." -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "                 📊 CLEANUP SUMMARY" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " Total Deployments Scanned : $totalScanned"
Write-Host " Protected Active Builds    : $totalRetained"
if ($DryRun) {
    Write-Host " Deployments Eligible      : $totalDeleted (Dry Run)"
} else {
    Write-Host " Deployments Purged        : $totalDeleted" -ForegroundColor Green
    if ($totalErrors -gt 0) {
        Write-Host " Errors Encountered        : $totalErrors" -ForegroundColor Red
    }
}
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "✨ Finished! Your Vercel storage has been successfully reclaimed.`n" -ForegroundColor Green
