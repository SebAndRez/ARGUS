<#
.SYNOPSIS
  Runs Fase 11 (physical validations) + Fase 12 (RLS runtime checks) against
  the already-fully-migrated local rehearsal database, plus Fase 16 (prisma
  validate) and Fase 17 (repo test suites). Does NOT apply or roll back any
  wave - call after Invoke-ArgusFullRehearsal.ps1's wave loop, or standalone
  against an already-built rehearsal database.
#>
param(
    [switch]$SkipFixtures,
    [switch]$SkipRepoTests
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")
Get-ArgusLocalEnv | Out-Null
Assert-ArgusLocalOnly

$summary = [ordered]@{
    StartedAt = (Get-Date).ToString("o")
}

Write-ArgusLog "=== Test-ArgusRehearsal: Fase 11 physical validations ==="
$physical = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\physical-validations.sql")
$summary.PhysicalValidations = $physical.Output

if (-not $SkipFixtures) {
    Write-ArgusLog "=== Fase 10: applying synthetic fixtures (1st run) ==="
    $f1 = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "fixtures\001_synthetic_fixtures.sql")
    Write-ArgusLog "=== Fase 10: re-applying synthetic fixtures (2nd run, idempotency check) ==="
    $f2 = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "fixtures\001_synthetic_fixtures.sql")
    $summary.FixturesFirstRun = $f1.ExitCode
    $summary.FixturesSecondRun = $f2.ExitCode
}

Write-ArgusLog "=== Test-ArgusRehearsal: Fase 12 RLS runtime checks ==="
$rls = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\rls-runtime-checks.sql")
$summary.RlsChecksOutput = $rls.Output
$rlsFailures = $rls.Output | Select-String -Pattern "RLS_TEST_FAIL"
if ($rlsFailures) {
    Write-ArgusLog "RLS runtime checks reported failures:`n$($rlsFailures -join "`n")" -Level "ERROR"
    $summary.RlsResult = "FAIL"
} else {
    Write-ArgusLog "RLS runtime checks: all RLS_TEST_PASS, zero RLS_TEST_FAIL."
    $summary.RlsResult = "PASS"
}

Write-ArgusLog "=== Fase 16: prisma validate --schema prisma/schema.target.prisma ==="
Push-Location $Script:ArgusRepoRoot
try {
    $prismaOutput = & npx prisma validate --schema prisma/schema.target.prisma 2>&1
    $summary.PrismaValidateExitCode = $LASTEXITCODE
    $summary.PrismaValidateOutput = $prismaOutput
    Write-ArgusLog "prisma validate exit=$LASTEXITCODE"
} finally {
    Pop-Location
}

if (-not $SkipRepoTests) {
    Write-ArgusLog "=== Fase 17: repo test suites (target / P0 / rehearsal guard) ==="
    Push-Location $Script:ArgusRepoRoot
    try {
        $targetTests = & npx vitest run tests/database-target/ 2>&1
        $summary.TargetTestsExitCode = $LASTEXITCODE
        $summary.TargetTestsOutput = $targetTests | Select-Object -Last 20

        $p0Tests = & npx vitest run tests/p0/notifications-endpoint-auth.test.ts tests/p0/risk-assessments-endpoint-auth.test.ts 2>&1
        $summary.P0TestsExitCode = $LASTEXITCODE
        $summary.P0TestsOutput = $p0Tests | Select-Object -Last 20
    } finally {
        Pop-Location
    }
}

$summary.FinishedAt = (Get-Date).ToString("o")

if (-not (Test-Path $Script:ArgusArtifactDir)) {
    New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null
}
$summary | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $Script:ArgusArtifactDir "test-summary.json") -Encoding utf8

return $summary
