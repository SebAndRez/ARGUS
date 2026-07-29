<#
.SYNOPSIS
  Applies (or rolls back) a single wave folder under prisma/target-migrations/
  against the local rehearsal database, per Fase 9 / Fase 14 of the mandate.

.DESCRIPTION
  Forward mode (default): pre-catalog snapshot -> validation.sql (pre, if a
  distinct pre-check is embedded) -> migration.sql -> backfill.sql ->
  validation.sql (post) -> post-catalog snapshot -> test-plan.md-named tests
  that exist as real .test.ts files.

  Rollback mode (-Rollback): runs only rollback.sql, with before/after catalog
  snapshots, per Fase 14.

  Every SQL file is applied with ON_ERROR_STOP=1 (see Common.ps1's
  Invoke-ArgusPsql) - a failing statement aborts this wave immediately rather
  than continuing past a partially-applied migration.
#>
param(
    [Parameter(Mandatory)][string]$WaveDir,
    [switch]$Rollback,
    [switch]$SkipBackfill
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")

$waveName = Split-Path $WaveDir -Leaf
Write-ArgusLog "=== Wave $waveName $(if ($Rollback) { '(ROLLBACK)' } else { '(APPLY)' }) ==="

$result = [ordered]@{
    Wave           = $waveName
    Mode           = if ($Rollback) { "ROLLBACK" } else { "APPLY" }
    StartedAt      = (Get-Date).ToString("o")
    Steps          = @()
    Success        = $false
}

function Add-Step {
    param($Name, $Outcome)
    $result.Steps += [ordered]@{
        Name       = $Name
        ExitCode   = $Outcome.ExitCode
        DurationMs = $Outcome.DurationMs
    }
}

try {
    $preCatalog = Get-ArgusCatalogSnapshot
    $result.PreCatalog = $preCatalog.Output

    if ($Rollback) {
        $rollbackFile = Join-Path $WaveDir "rollback.sql"
        if (Test-Path $rollbackFile) {
            $o = Invoke-ArgusPsql -SqlFile $rollbackFile
            Add-Step "rollback.sql" $o
        } else {
            Write-ArgusLog "No rollback.sql in $waveName - nothing to roll back." -Level "WARN"
        }
    } else {
        $migrationFile = Join-Path $WaveDir "migration.sql"
        $backfillFile  = Join-Path $WaveDir "backfill.sql"
        $validationFile = Join-Path $WaveDir "validation.sql"

        if (Test-Path $validationFile) {
            # validation.sql is written to be safe to run before OR after
            # (SELECT-only) - running it pre-migration is a smoke check that
            # it doesn't itself error out on an empty/prior-wave database.
            $o = Invoke-ArgusPsql -SqlFile $validationFile -AllowFailure
            Add-Step "validation.sql (pre)" $o
        }

        if (Test-Path $migrationFile) {
            $o = Invoke-ArgusPsql -SqlFile $migrationFile
            Add-Step "migration.sql" $o
        } else {
            throw "$waveName has no migration.sql - cannot apply."
        }

        # rls_roles.sql / rls_policies.sql - only 010_foundation has these as
        # separate files (shared functions like security.fn_is_owner() and the
        # role posture every later wave's inline RLS policies depend on).
        # Every other wave declares its own RLS inline in migration.sql. Order
        # matters: roles before policies (rls_roles.sql's own header - policies
        # reference the roles), both before backfill.sql.
        $rlsRolesFile = Join-Path $WaveDir "rls_roles.sql"
        $rlsPoliciesFile = Join-Path $WaveDir "rls_policies.sql"
        $rlsValidationFile = Join-Path $WaveDir "rls_validation.sql"
        if (Test-Path $rlsRolesFile) {
            $o = Invoke-ArgusPsql -SqlFile $rlsRolesFile
            Add-Step "rls_roles.sql" $o
        }
        if (Test-Path $rlsPoliciesFile) {
            $o = Invoke-ArgusPsql -SqlFile $rlsPoliciesFile
            Add-Step "rls_policies.sql" $o
        }

        if (-not $SkipBackfill -and (Test-Path $backfillFile)) {
            $o = Invoke-ArgusPsql -SqlFile $backfillFile
            Add-Step "backfill.sql (1st run)" $o

            # Fase 13 - idempotency: run again immediately, expect zero
            # duplicates / zero errors on the second pass.
            $o2 = Invoke-ArgusPsql -SqlFile $backfillFile
            Add-Step "backfill.sql (2nd run, idempotency check)" $o2
        }

        if (Test-Path $validationFile) {
            $o = Invoke-ArgusPsql -SqlFile $validationFile
            Add-Step "validation.sql (post)" $o
        }

        if (Test-Path $rlsValidationFile) {
            # SELECT-only, schema-wide (safe/idempotent at any point - see its
            # own header), so AllowFailure is not needed here the way
            # validation.sql's pre-run uses it.
            $o = Invoke-ArgusPsql -SqlFile $rlsValidationFile
            Add-Step "rls_validation.sql" $o
        }
    }

    $postCatalog = Get-ArgusCatalogSnapshot
    $result.PostCatalog = $postCatalog.Output
    $result.Success = $true
} catch {
    $result.Error = $_.Exception.Message
    Write-ArgusLog "Wave $waveName FAILED: $($_.Exception.Message)" -Level "ERROR"
    throw
} finally {
    $result.FinishedAt = (Get-Date).ToString("o")
    if (-not (Test-Path $Script:ArgusArtifactDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null
    }
    $suffix = if ($Rollback) { "rollback" } else { "apply" }
    $resultFile = Join-Path $Script:ArgusArtifactDir "$waveName.$suffix.json"
    $result | ConvertTo-Json -Depth 6 | Set-Content -Path $resultFile -Encoding utf8
}

return $result
