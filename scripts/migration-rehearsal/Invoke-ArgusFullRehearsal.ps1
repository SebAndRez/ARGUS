<#
.SYNOPSIS
  Single entry point for the full local migration rehearsal (Fases 4-22 of
  the mandate). Run this once Docker Desktop is installed and `docker info`
  responds. Does everything up to, but not including, `git push` (never
  pushes - see Fase 21).

.DESCRIPTION
  1. Preflight: confirms Docker responds, confirms prisma/schema.prisma and
     prisma/migrations/ have no diff (aborts otherwise - those must never be
     touched by this rehearsal).
  2. Reset-ArgusRehearsal.ps1: fresh disposable container + volume.
  3. Applies waves 000..100 in folder order via Invoke-Wave.ps1 (migration +
     backfill x2 + validation, catalog snapshot before/after each).
  4. Test-ArgusRehearsal.ps1: fixtures, RLS runtime checks, physical
     validations, the security.audit_logs monthly-partition lifecycle
     (structure/UTC bounds/index attachment/operational window/backfill
     months/tableoid routing/RLS matrix, plus real multi-connection
     concurrency), prisma validate, repo test suites.
  5. Rolls back waves 100..000 via Invoke-Wave.ps1 -Rollback, verifies the
     post-rollback catalog against the pre-Wave-000 snapshot.
  6. Reapplies waves 000..100 again (Fase 7 reproducibility, immediately
     after rollback, same volume).
  7. Reset-ArgusRehearsal.ps1 again (fresh volume this time - Fase 15) and
     repeats the full apply + validate cycle once more, proving
     reproducibility from a genuinely empty database.
  8. Writes the Fase 18 result documents under docs/architecture/private/
     (never added to git).
  9. Stages and commits ONLY the permitted tracked paths (Fase 19-21), if
     anything real changed.
  10. Tears the rehearsal container/volume down (Fase 22). Never pushes.

  If any wave's migration/validation/rollback fails for a REAL reason (not
  an environment problem), this script stops with a non-zero exit and a
  clear error naming the exact file and statement. The correct next step is
  for a human/agent session to fix that specific file under
  prisma/target-migrations/, then re-run this same script from the top -
  Reset-ArgusRehearsal.ps1 always tears down and recreates first, so re-runs
  are always safe and start from a genuinely empty database.
#>
param(
    [switch]$SkipSecondInstall
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")

$overallResult = [ordered]@{
    StartedAt = (Get-Date).ToString("o")
}

function Assert-CleanTargetFiles {
    Push-Location $Script:ArgusRepoRoot
    try {
        $schemaDiff = & git diff -- prisma/schema.prisma
        $migrationsDiff = & git diff -- prisma/migrations/
        if ($schemaDiff -or $migrationsDiff) {
            throw "prisma/schema.prisma or prisma/migrations/ has a pending diff - refusing to proceed. This rehearsal must never touch either."
        }
        Write-ArgusLog "Confirmed: prisma/schema.prisma and prisma/migrations/ have zero diff."
    } finally {
        Pop-Location
    }
}

function Assert-DockerReady {
    $info = Invoke-ArgusNative { & docker info 2>&1 }
    if ($LASTEXITCODE -ne 0) {
        throw "docker info failed - Docker Desktop is not installed/running. Install it first (see scripts/migration-rehearsal/README.md), then re-run this script."
    }
    $osType = Invoke-ArgusNative { & docker info --format '{{.OSType}}' 2>&1 }
    if ($osType -ne "linux") {
        throw "Docker is running $osType containers, not linux - switch Docker Desktop to Linux containers."
    }
    Write-ArgusLog "Docker ready: linux containers confirmed."
    return @{
        DockerVersion = (Invoke-ArgusNative { & docker version --format '{{.Server.Version}}' 2>&1 })
        ComposeVersion = (Invoke-ArgusNative { & docker compose version 2>&1 })
    }
}

function Invoke-ArgusWaveCycle {
    param([switch]$IsSecondInstall)
    $waves = Get-ArgusWaveList
    $cycleResults = @()
    foreach ($waveDir in $waves) {
        $r = & (Join-Path $PSScriptRoot "Invoke-Wave.ps1") -WaveDir $waveDir
        $cycleResults += $r
    }
    return $cycleResults
}

function Invoke-ArgusRollbackCycle {
    $waves = Get-ArgusWaveList
    $reversed = $waves | Sort-Object -Descending
    $cycleResults = @()
    foreach ($waveDir in $reversed) {
        $r = & (Join-Path $PSScriptRoot "Invoke-Wave.ps1") -WaveDir $waveDir -Rollback
        $cycleResults += $r
    }
    return $cycleResults
}

try {
    Write-ArgusLog "=========================================="
    Write-ArgusLog "ARGUS full local migration rehearsal - START"
    Write-ArgusLog "=========================================="

    Assert-CleanTargetFiles
    $overallResult.Docker = Assert-DockerReady

    # ---- Fase 5-7: fresh environment, waves 000-100 (1st install) ----
    & (Join-Path $PSScriptRoot "Reset-ArgusRehearsal.ps1")
    $emptyCatalog = Get-ArgusCatalogSnapshot
    $overallResult.EmptyCatalogSnapshot = $emptyCatalog.Output

    # Per-object baseline for the Fase 3/4 zero-residue assertion. The
    # aggregate counts above are not enough to prove rollback correctness —
    # a diffable object list is (mandate: "No aceptes 'el script terminó sin
    # error' como prueba de rollback correcto").
    $emptyInventory = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\catalog-object-inventory.sql")
    $baselineInventoryPath = Join-Path $Script:ArgusArtifactDir "catalog-inventory-empty.txt"
    if (-not (Test-Path $Script:ArgusArtifactDir)) { New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null }
    $emptyInventory.Output | Set-Content -Path $baselineInventoryPath -Encoding utf8

    # Legacy-schema synthetic fixtures (public schema) - loaded here, after the
    # empty-catalog snapshot so that snapshot stays genuinely empty, and before
    # any wave applies, since Wave 010's backfill.sql is the first to SELECT
    # FROM legacy tables (see fixtures/000_legacy_synthetic_fixtures.sql header).
    Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "fixtures\000_legacy_synthetic_fixtures.sql") | Out-Null

    Write-ArgusLog "=== Fase 9: applying all 11 waves, 1st install ==="
    $overallResult.FirstInstallWaves = Invoke-ArgusWaveCycle

    # ---- Fase 10-12,16,17: fixtures, RLS, physical validations, prisma, repo tests ----
    $overallResult.FirstInstallTests = & (Join-Path $PSScriptRoot "Test-ArgusRehearsal.ps1")

    # ---- Fase 14: rollback 100 -> 000 ----
    Write-ArgusLog "=== Fase 14: rollback, waves 100 -> 000 ==="
    $overallResult.RollbackWaves = Invoke-ArgusRollbackCycle
    $postRollbackCatalog = Get-ArgusCatalogSnapshot
    $overallResult.PostRollbackCatalogSnapshot = $postRollbackCatalog.Output

    # ---- Fase 4 (corrective mandate): ARGUS_TARGET_RESIDUAL_OBJECT_COUNT = 0 ----
    # BLOCKING. Extensions and the synthetic legacy `public.*` fixtures are
    # classified out by classify-catalog-residue.mjs; anything else left in
    # the catalog after a full 100->000 rollback fails the rehearsal here.
    Write-ArgusLog "=== Fase 4: asserting ARGUS_TARGET_RESIDUAL_OBJECT_COUNT = 0 ==="
    $postRollbackInventory = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\catalog-object-inventory.sql")
    $postRollbackInventoryPath = Join-Path $Script:ArgusArtifactDir "catalog-inventory-post-rollback.txt"
    $postRollbackInventory.Output | Set-Content -Path $postRollbackInventoryPath -Encoding utf8

    Push-Location $Script:ArgusRepoRoot
    try {
        $residueReport = Invoke-ArgusNative {
            & node (Join-Path $PSScriptRoot "lib\classify-catalog-residue.mjs") $baselineInventoryPath $postRollbackInventoryPath 2>&1
        }
        $residueExit = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    $overallResult.RollbackResidueReport = $residueReport
    $residueCountLine = $residueReport | Select-String -Pattern "ARGUS_TARGET_RESIDUAL_OBJECT_COUNT="
    Write-ArgusLog "$residueCountLine"
    if ($residueExit -ne 0) {
        throw "ROLLBACK_ZERO_RESIDUE_FAIL - ARGUS target objects survived the full 100->000 rollback:`n$($residueReport -join "`n")"
    }
    $overallResult.RollbackZeroResiduePass = $true
    Write-ArgusLog "ROLLBACK_ZERO_RESIDUE_PASS"

    # ---- Audit partition rollback: zero partitions, zero functions ----
    # The generic residue classifier above would already catch a surviving
    # partition or function, but it reports them as anonymous "unexpected
    # objects". This asserts the specific claim the corrective mandate makes,
    # by name, so a regression names itself: the partition set is DYNAMIC now
    # (created on demand for arbitrary months), so a rollback that only knew
    # how to drop `audit_logs_y2026m07` would leave orphans behind.
    Write-ArgusLog "=== Audit partition rollback: asserting zero partitions and zero lifecycle functions survive ==="
    $auditRollback = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\audit-partition-residue.sql") -AllowFailure
    $auditResidue = @($auditRollback.Output | Select-String -Pattern "AUDIT_PARTITION_RESIDUE\|")
    $overallResult.AuditPartitionRollbackResidue = $auditResidue
    if ($auditRollback.ExitCode -ne 0) {
        throw "AUDIT_PARTITION_ROLLBACK_FAIL - the residue query itself failed (exit $($auditRollback.ExitCode))."
    }
    if ($auditResidue.Count -gt 0) {
        throw "AUDIT_PARTITION_ROLLBACK_FAIL - audit partition objects survived the full 100->000 rollback:`n$($auditResidue -join "`n")"
    }
    $overallResult.AuditPartitionRollbackPass = $true
    Write-ArgusLog "AUDIT_PARTITION_ROLLBACK_PASS"

    # ---- Fase 7 (reproducibility within the SAME volume): reapply 000-100 ----
    Write-ArgusLog "=== Fase 7: reapplying all 11 waves after rollback (same volume) ==="
    $overallResult.ReapplyWaves = Invoke-ArgusWaveCycle
    $overallResult.ReapplyTests = & (Join-Path $PSScriptRoot "Test-ArgusRehearsal.ps1") -SkipRepoTests

    if (-not $SkipSecondInstall) {
        # ---- Fase 15: destroy volume completely, fresh install from scratch ----
        Write-ArgusLog "=== Fase 15: destroying volume, fresh install from a genuinely empty database ==="
        & (Join-Path $PSScriptRoot "Reset-ArgusRehearsal.ps1")
        Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "fixtures\000_legacy_synthetic_fixtures.sql") | Out-Null
        $overallResult.SecondInstallWaves = Invoke-ArgusWaveCycle
        $overallResult.SecondInstallTests = & (Join-Path $PSScriptRoot "Test-ArgusRehearsal.ps1")
    }

    # ---- Audit partition summary (mandate: the rehearsal summary must carry
    # these five markers explicitly). Every one is DERIVED from a result
    # captured above - none is printed unconditionally, so a marker present in
    # the summary always means the corresponding assertion actually ran and
    # passed.
    $auditMarkers = @()
    $firstTests = $overallResult.FirstInstallTests
    if ($firstTests -and ($firstTests.AuditPartitionChecksOutput -join "`n") -match "AUDIT_PARTITION_WINDOW_PASS")   { $auditMarkers += "AUDIT_PARTITION_WINDOW_PASS" }
    if ($firstTests -and $firstTests.AuditPartitionConcurrencyResult -eq "PASS")                                     { $auditMarkers += "AUDIT_PARTITION_CONCURRENCY_PASS" }
    if ($firstTests -and ($firstTests.AuditPartitionChecksOutput -join "`n") -match "AUDIT_PARTITION_RLS_PASS")      { $auditMarkers += "AUDIT_PARTITION_RLS_PASS" }
    if ($firstTests -and ($firstTests.AuditPartitionChecksOutput -join "`n") -match "AUDIT_PARTITION_BACKFILL_PASS") { $auditMarkers += "AUDIT_PARTITION_BACKFILL_PASS" }
    if ($overallResult.AuditPartitionRollbackPass)                                                                   { $auditMarkers += "AUDIT_PARTITION_ROLLBACK_PASS" }

    $expectedAuditMarkers = @(
        "AUDIT_PARTITION_WINDOW_PASS",
        "AUDIT_PARTITION_CONCURRENCY_PASS",
        "AUDIT_PARTITION_RLS_PASS",
        "AUDIT_PARTITION_BACKFILL_PASS",
        "AUDIT_PARTITION_ROLLBACK_PASS"
    )
    $missingAuditMarkers = @($expectedAuditMarkers | Where-Object { $auditMarkers -notcontains $_ })
    $overallResult.AuditPartitionMarkers = $auditMarkers
    if ($missingAuditMarkers.Count -gt 0) {
        throw "AUDIT_PARTITION_SUMMARY_FAIL - the rehearsal completed without proving: $($missingAuditMarkers -join ', ')"
    }
    Write-ArgusLog "=== Audit partition summary ==="
    foreach ($marker in $auditMarkers) { Write-ArgusLog $marker }

    $overallResult.Success = $true
} catch {
    $overallResult.Success = $false
    $overallResult.Error = $_.Exception.Message
    Write-ArgusLog "REHEARSAL FAILED: $($_.Exception.Message)" -Level "ERROR"
    Write-ArgusLog "Fix the specific file named above under prisma/target-migrations/, then re-run this script from the top." -Level "ERROR"
} finally {
    $overallResult.FinishedAt = (Get-Date).ToString("o")

    if (-not (Test-Path $Script:ArgusArtifactDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null
    }
    $overallResult | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $Script:ArgusArtifactDir "full-rehearsal-result.json") -Encoding utf8

    # ---- Fase 18: write result docs (private, never git-added) ----
    if (Test-Path $Script:ArgusPrivateDocsDir) {
        $reportPath = Join-Path $Script:ArgusPrivateDocsDir "ARGUS_FULL_LOCAL_MIGRATION_REHEARSAL_v1.0.md"
        $status = if ($overallResult.Success) { "SUCCESS" } else { "FAILED: $($overallResult.Error)" }
        @"
# ARGUS Full Local Migration Rehearsal v1.0

Generated: $(Get-Date -Format o)
Status: $status

Audit partition lifecycle markers proven this run:
$(if ($overallResult.AuditPartitionMarkers) { ($overallResult.AuditPartitionMarkers | ForEach-Object { "- $_" }) -join "`n" } else { "- (none - the run did not reach the audit partition summary)" })

Full machine-readable detail: migration-rehearsal-artifacts/full-rehearsal-result.json
(git-excluded, see .git/info/exclude)

See also (same directory, git-excluded):
- migration-rehearsal-artifacts/*.apply.json / *.rollback.json - per-wave detail
- migration-rehearsal-artifacts/test-summary.json - RLS/physical/prisma/repo test detail
- migration-rehearsal-logs/rehearsal.log - full chronological log
- migration-rehearsal-logs/psql-output.log - raw psql output per statement file
"@ | Set-Content -Path $reportPath -Encoding utf8
        Write-ArgusLog "Wrote summary to $reportPath"
    }

    # ---- Fase 22: cleanup ----
    Write-ArgusLog "=== Fase 22: tearing down rehearsal container + volume ==="
    Push-Location $Script:ArgusRepoRoot
    try {
        if (
            (Get-Command docker -ErrorAction SilentlyContinue) -and
            (Test-Path $Script:ArgusComposeFile) -and
            (Test-Path $Script:ArgusEnvLocalFile)
        ) {
            Invoke-ArgusNative { & docker compose --env-file $Script:ArgusEnvLocalFile -f $Script:ArgusComposeFile down -v 2>&1 } | ForEach-Object { Write-ArgusLog $_ }
        } else {
            Write-ArgusLog "Cleanup skipped: Docker, compose file, or local env file is unavailable." "WARN"
        }
    } finally {
        Pop-Location
    }
    if (Test-Path $Script:ArgusEnvLocalFile) {
        Remove-Item -Force $Script:ArgusEnvLocalFile
        Write-ArgusLog "Removed .env.argus-migration.local."
    }
}

Write-ArgusLog "=========================================="
Write-ArgusLog "ARGUS full local migration rehearsal - END (Success=$($overallResult.Success))"
Write-ArgusLog "=========================================="

if (-not $overallResult.Success) {
    exit 1
}
