# scripts/database-target/Assert-ProductionMigrationReady.ps1
#
# PowerShell entry point for the drift guard (13 local prisma/migrations/
# folders vs. 15 rows in production `_prisma_migrations`, per
# ARGUS_PRISMA_MIGRATION_DRIFT_v1.0.md §3). Thin wrapper around the Node
# implementation (Assert-ProductionMigrationReady.mjs / lib/driftGuard.mjs)
# so CI and local PowerShell callers share one source of truth. Never
# connects to production — fails closed without an explicit evidence file.

param(
    [string]$EvidencePath = $env:ARGUS_DRIFT_EVIDENCE_PATH
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "Assert-ProductionMigrationReady.mjs"

$nodeArgs = @($nodeScript)
if ($EvidencePath) {
    $nodeArgs += @("--evidence", $EvidencePath)
}

& node @nodeArgs
exit $LASTEXITCODE
