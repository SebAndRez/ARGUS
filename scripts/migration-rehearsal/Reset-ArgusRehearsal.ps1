<#
.SYNOPSIS
  Tears down the rehearsal container + volume completely and brings up a
  fresh, empty one. Used both mid-run (Fase 9: a failed wave destroys and
  recreates before retrying from Wave 000) and for Fase 15's from-scratch
  reinstall.

.PARAMETER KeepEnvFile
  If set, reuses the existing .env.argus-migration.local (same generated
  password) instead of generating a new one. Fase 15 explicitly wants a new
  volume, not necessarily a new password - default behavior generates a new
  password too, which is still correct (nothing depends on password
  stability across resets).
#>
param(
    [switch]$KeepEnvFile
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")

Write-ArgusLog "=== Reset-ArgusRehearsal: tearing down container + volume ==="

if (-not $KeepEnvFile -or -not (Test-Path $Script:ArgusEnvLocalFile)) {
    New-ArgusEnvLocalFile | Out-Null
} else {
    Get-ArgusLocalEnv | Out-Null
}

Assert-ArgusLocalOnly

Push-Location $Script:ArgusRepoRoot
try {
    & docker compose -f $Script:ArgusComposeFile down -v 2>&1 | ForEach-Object { Write-ArgusLog $_ }

    Write-ArgusLog "Pulling image (also captures real digest for the manifest)..."
    & docker compose -f $Script:ArgusComposeFile pull 2>&1 | ForEach-Object { Write-ArgusLog $_ }
    $digest = & docker inspect --format='{{index .RepoDigests 0}}' postgis/postgis:17-3.5 2>$null
    if ($digest) {
        Write-ArgusLog "Pulled image digest: $digest"
    }

    Write-ArgusLog "Starting fresh container..."
    & docker compose -f $Script:ArgusComposeFile up -d 2>&1 | ForEach-Object { Write-ArgusLog $_ }

    Wait-ArgusPostgresHealthy -TimeoutSeconds 180

    $versionCheck = Invoke-ArgusPsql -SqlText "SELECT version(); SELECT PostGIS_Full_Version();"
    Write-ArgusLog "Fresh instance version check:`n$($versionCheck.Output)"
} finally {
    Pop-Location
}

Write-ArgusLog "=== Reset-ArgusRehearsal complete: empty, healthy, local-only database ready ==="
