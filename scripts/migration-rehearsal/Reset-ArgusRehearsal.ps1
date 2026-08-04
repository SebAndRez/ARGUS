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
    Invoke-ArgusBlockingCommand -Phase "Reset/ComposeDown" -Command "docker" `
        -Arguments @("compose", "--env-file", $Script:ArgusEnvLocalFile, "-f", $Script:ArgusComposeFile, "down", "-v") `
        -FailureCode "REHEARSAL_RESET_FAILED" -TimeoutSeconds 300 | Out-Null

    # `pull` is the ONE call here that is deliberately not blocking, and the
    # reason is explicit rather than silent: a registry that cannot be reached
    # must not fail a rehearsal whose image is already local. It is not
    # "tolerated" - `up -d` immediately below is blocking and cannot succeed
    # without the image, so a genuinely missing image still fails the run, with
    # a clearer error than a pull timeout would give.
    Write-ArgusLog "Pulling image (also captures real digest for the manifest)..."
    $pullExit = 0
    try {
        Invoke-ArgusBlockingCommand -Phase "Reset/ComposePull" -Command "docker" `
            -Arguments @("compose", "--env-file", $Script:ArgusEnvLocalFile, "-f", $Script:ArgusComposeFile, "pull") `
            -FailureCode "REHEARSAL_IMAGE_PULL_FAILED" -TimeoutSeconds 900 | Out-Null
    } catch {
        $pullExit = (Get-ArgusLastCommandResult).ExitCode
        Write-ArgusLog "docker compose pull exited $pullExit - continuing to 'up -d', which is blocking and requires the image to be present locally." -Level "WARN"
    }
    Add-ArgusPhaseResult -Name "Reset/ComposePull" -Required $false -ExitCode $pullExit -Passed ($pullExit -eq 0) `
        -FailureCode "REHEARSAL_IMAGE_PULL_FAILED" -Evidence "non-blocking by design; 'up -d' is the blocking gate" | Out-Null

    $digest = & docker inspect --format='{{index .RepoDigests 0}}' postgis/postgis:17-3.5 2>$null
    if ($digest) {
        Write-ArgusLog "Pulled image digest: $digest"
    }

    Write-ArgusLog "Starting fresh container..."
    Invoke-ArgusBlockingCommand -Phase "Reset/ComposeUp" -Command "docker" `
        -Arguments @("compose", "--env-file", $Script:ArgusEnvLocalFile, "-f", $Script:ArgusComposeFile, "up", "-d") `
        -FailureCode "REHEARSAL_RESET_FAILED" -TimeoutSeconds 600 | Out-Null

    Wait-ArgusPostgresHealthy -TimeoutSeconds 180

    $versionCheck = Invoke-ArgusPsql -SqlText "SELECT version(); SELECT PostGIS_Full_Version();"
    Write-ArgusLog "Fresh instance version check:`n$($versionCheck.Output)"
} finally {
    Pop-Location
}

Write-ArgusLog "=== Reset-ArgusRehearsal complete: empty, healthy, local-only database ready ==="
