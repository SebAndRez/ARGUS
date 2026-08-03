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

# ============================================================
# Fase 6/7 (corrective mandate): REAL RLS matrix under non-superuser,
# NOBYPASSRLS roles. Unlike rls-runtime-checks.sql (posture only), this
# asserts BEHAVIOR in both directions and THROWS on any failure — a
# rehearsal that reports "RLS ok" while a negative case leaked rows is
# exactly the false green this mandate forbids.
# ============================================================
Write-ArgusLog "=== Fase 6/7: RLS matrix (non-superuser roles, positive + negative) ==="
$rlsMatrix = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\rls-matrix-checks.sql") -AllowFailure
$summary.RlsMatrixOutput = $rlsMatrix.Output

$matrixFailures = $rlsMatrix.Output | Select-String -Pattern "RLS_TEST_FAIL"
$matrixPositives = @($rlsMatrix.Output | Select-String -Pattern "RLS_TEST_PASS \| positive")
$matrixNegatives = @($rlsMatrix.Output | Select-String -Pattern "RLS_TEST_PASS \| negative")
$matrixRoleSec  = @($rlsMatrix.Output | Select-String -Pattern "RLS_TEST_PASS \| role_security")
$matrixNotStub  = @($rlsMatrix.Output | Select-String -Pattern "RLS_TEST_PASS \| helper_not_stub")

if ($matrixFailures) {
    throw "RLS_MATRIX_FAIL - the RLS matrix reported failures:`n$($matrixFailures -join "`n")"
}
if ($rlsMatrix.ExitCode -ne 0) {
    throw "RLS_MATRIX_FAIL - rls-matrix-checks.sql exited $($rlsMatrix.ExitCode); an aborted matrix is not a passing matrix."
}
# A suite where nothing is asserted, or where only negatives pass, proves
# nothing (mandate Fase 7: "Un suite donde todo devuelve false no se
# considera RLS validado").
if ($matrixPositives.Count -lt 5)  { throw "RLS_MATRIX_FAIL - only $($matrixPositives.Count) positive cases passed; expected at least 5." }
if ($matrixNegatives.Count -lt 10) { throw "RLS_MATRIX_FAIL - only $($matrixNegatives.Count) negative cases passed; expected at least 10." }
if ($matrixRoleSec.Count  -lt 2)   { throw "RLS_MATRIX_FAIL - role-security preconditions did not pass (superuser/BYPASSRLS check missing)." }
if ($matrixNotStub.Count  -lt 3)   { throw "RLS_MATRIX_FAIL - helper-not-stub assertions did not pass for all 3 RLS helpers." }

$summary.RlsPositivePass    = $matrixPositives.Count
$summary.RlsNegativePass    = $matrixNegatives.Count
$summary.RlsRoleSecurityPass = $matrixRoleSec.Count
$summary.RlsMatrixResult    = "PASS"
Write-ArgusLog "RLS_POSITIVE_PASS=$($matrixPositives.Count) RLS_NEGATIVE_PASS=$($matrixNegatives.Count) RLS_ROLE_SECURITY_PASS=$($matrixRoleSec.Count)"

# ============================================================
# security.audit_logs monthly partition lifecycle. BLOCKING.
#
# Two parts, because they need different harnesses:
#   * sql/audit-partition-checks.sql - structure, UTC bounds, index
#     attachment, operational window, backfill months, real tableoid routing
#     at the exact boundary instants, and the RLS/privilege matrix under real
#     non-superuser roles. Single connection.
#   * Test-ArgusAuditPartitionConcurrency below - genuine simultaneous
#     connections, which a single psql session cannot produce. This is the
#     only way to prove the per-month advisory lock actually serializes
#     creation instead of two sessions racing into duplicate_table.
# ============================================================
Write-ArgusLog "=== Audit partition lifecycle: structure, bounds, window, backfill, routing, RLS ==="
$auditPartition = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\audit-partition-checks.sql") -AllowFailure
$summary.AuditPartitionChecksOutput = $auditPartition.Output

$auditPartitionFailures = @($auditPartition.Output | Select-String -Pattern "AUDIT_PARTITION_[A-Z_]*FAIL")
if ($auditPartitionFailures.Count -gt 0) {
    throw "AUDIT_PARTITION_FAIL - audit-partition-checks.sql reported failures:`n$($auditPartitionFailures -join "`n")"
}
if ($auditPartition.ExitCode -ne 0) {
    throw "AUDIT_PARTITION_FAIL - audit-partition-checks.sql exited $($auditPartition.ExitCode); an aborted check file is not a passing check file."
}
# A missing marker is as much a failure as an explicit FAIL: it means the
# assertion never ran (aborted file, skipped block, renamed marker).
$requiredAuditMarkers = @(
    "AUDIT_PARTITION_PARENT_PASS",
    "AUDIT_PARTITION_NO_DEFAULT_PASS",
    "AUDIT_PARTITION_BOUNDS_PASS",
    "AUDIT_PARTITION_INDEX_PASS",
    "AUDIT_PARTITION_WINDOW_PASS",
    "AUDIT_PARTITION_SECURITY_PASS",
    "AUDIT_PARTITION_BACKFILL_PASS",
    "AUDIT_PARTITION_RLS_PASS",
    "AUDIT_PARTITION_MAINTENANCE_IDEMPOTENT_PASS"
)
$auditPartitionText = $auditPartition.Output -join "`n"
foreach ($marker in $requiredAuditMarkers) {
    if ($auditPartitionText -notmatch [regex]::Escape($marker)) {
        throw "AUDIT_PARTITION_FAIL - required marker $marker is missing from audit-partition-checks.sql output."
    }
}
# The 8 mandated boundary instants must ALL have been routed and verified via
# tableoid, not just "the file didn't error".
$routingOk = @($auditPartition.Output | Select-String -Pattern "AUDIT_PARTITION_ROUTING_OK").Count
if ($routingOk -lt 8) {
    throw "AUDIT_PARTITION_FAIL - only $routingOk of the 8 boundary instants were routing-verified via tableoid."
}
$auditRlsPositive = @($auditPartition.Output | Select-String -Pattern "AUDIT_PARTITION_RLS_OK \| positive").Count
$auditRlsNegative = @($auditPartition.Output | Select-String -Pattern "AUDIT_PARTITION_RLS_OK \| negative").Count
if ($auditRlsPositive -lt 3) { throw "AUDIT_PARTITION_RLS_FAIL - only $auditRlsPositive positive case(s); a deny-everything matrix proves nothing." }
if ($auditRlsNegative -lt 7) { throw "AUDIT_PARTITION_RLS_FAIL - only $auditRlsNegative negative case(s)." }
$summary.AuditPartitionRoutingVerified = $routingOk
$summary.AuditPartitionRlsPositive = $auditRlsPositive
$summary.AuditPartitionRlsNegative = $auditRlsNegative
Write-ArgusLog "AUDIT_PARTITION_ROUTING_VERIFIED=$routingOk AUDIT_PARTITION_RLS_POSITIVE=$auditRlsPositive AUDIT_PARTITION_RLS_NEGATIVE=$auditRlsNegative"
Write-ArgusLog "AUDIT_PARTITION_WINDOW_PASS"
Write-ArgusLog "AUDIT_PARTITION_RLS_PASS"
Write-ArgusLog "AUDIT_PARTITION_BACKFILL_PASS"

function Invoke-ArgusParallelEnsure {
    <#
    Fires N genuinely simultaneous `security.fn_ensure_audit_log_partition`
    calls, one per background job, each on its OWN connection via
    `docker exec ... psql -c`. Returns one "<exit>|<output>" string per job.

    Start-Job (not Start-Process) deliberately: PowerShell's native-command
    invocation quotes the SQL argument correctly, whereas Start-Process
    -ArgumentList in PowerShell 5.1 flattens an array with plain spaces and
    would split the statement.
    #>
    param(
        [Parameter(Mandatory)][string[]]$Timestamps,
        [int]$RepeatEach = 1
    )
    $jobs = @()
    foreach ($ts in $Timestamps) {
        for ($i = 0; $i -lt $RepeatEach; $i++) {
            $sql = "SELECT security.fn_ensure_audit_log_partition(TIMESTAMPTZ '$ts');"
            $jobs += Start-Job -ScriptBlock {
                param($container, $user, $database, $password, $statement)
                $out = & docker exec -i -e "PGPASSWORD=$password" $container `
                    psql -U $user -d $database -t -A -v ON_ERROR_STOP=1 --no-psqlrc -c $statement 2>&1
                "$LASTEXITCODE|$($out -join ' ')"
            } -ArgumentList $Script:ArgusContainerName, $env:POSTGRES_USER, $env:POSTGRES_DB, $env:POSTGRES_PASSWORD, $sql
        }
    }
    $results = @($jobs | Wait-Job -Timeout 180 | Receive-Job)
    $jobs | Remove-Job -Force
    return $results
}

Write-ArgusLog "=== Audit partition lifecycle: real concurrency (simultaneous connections) ==="
Assert-ArgusLocalOnly

# Months chosen far outside both the operational window and every backfill
# month, so the test creates them itself and nothing pre-existing can make a
# race trivially pass.
$sameMonth = "2031-05-10 12:00:00+00"
$sameMonthResults = Invoke-ArgusParallelEnsure -Timestamps @($sameMonth) -RepeatEach 10
$summary.AuditPartitionConcurrencySameMonth = $sameMonthResults

$sameMonthErrors = @($sameMonthResults | Where-Object { $_ -notmatch '^0\|' })
$sameMonthCreated = @($sameMonthResults | Where-Object { $_ -match 'CREATED' }).Count
$sameMonthExisting = @($sameMonthResults | Where-Object { $_ -match 'ALREADY_EXISTS' }).Count

if ($sameMonthResults.Count -ne 10) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - expected 10 concurrent results, got $($sameMonthResults.Count)."
}
if ($sameMonthErrors.Count -gt 0) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - $($sameMonthErrors.Count) concurrent ensure call(s) failed:`n$($sameMonthErrors -join "`n")"
}
if (($sameMonthResults -join ' ') -match 'duplicate_table|already exists|deadlock') {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - a concurrent ensure hit duplicate_table/deadlock:`n$($sameMonthResults -join "`n")"
}
if ($sameMonthCreated -ne 1) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - $sameMonthCreated call(s) reported CREATED for the same month; exactly 1 is correct."
}
if ($sameMonthExisting -ne 9) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - $sameMonthExisting call(s) reported ALREADY_EXISTS; expected 9."
}

# Different months in parallel: must all be created, and must not deadlock
# against each other on the parent's ACCESS EXCLUSIVE lock.
$distinctMonths = @("2031-06-01 00:00:00+00", "2031-07-15 00:00:00+00", "2031-08-31 23:59:59+00", "2031-12-31 23:59:59+00", "2032-01-01 00:00:00+00")
$distinctResults = Invoke-ArgusParallelEnsure -Timestamps $distinctMonths -RepeatEach 2
$summary.AuditPartitionConcurrencyDistinctMonths = $distinctResults

$distinctErrors = @($distinctResults | Where-Object { $_ -notmatch '^0\|' })
if ($distinctErrors.Count -gt 0) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - concurrent ensure across distinct months failed:`n$($distinctErrors -join "`n")"
}
if (($distinctResults -join ' ') -match 'duplicate_table|deadlock') {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - distinct-month concurrency hit duplicate_table/deadlock."
}
$distinctCreated = @($distinctResults | Where-Object { $_ -match 'CREATED' }).Count
if ($distinctCreated -ne $distinctMonths.Count) {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - expected exactly $($distinctMonths.Count) CREATED across distinct months, got $distinctCreated."
}

# One partition per month, correct bounds, nothing duplicated - asserted in
# SQL, then the test's own partitions are removed so the catalog is left
# exactly as it was found.
$concurrencyVerify = Invoke-ArgusPsql -SqlText @'
\pset format unaligned
\pset tuples_only on
DO $$
DECLARE
  v_name text;
  v_month timestamptz;
  v_n integer;
BEGIN
  FOREACH v_name IN ARRAY ARRAY['audit_logs_y2031m05','audit_logs_y2031m06','audit_logs_y2031m07','audit_logs_y2031m08','audit_logs_y2031m12','audit_logs_y2032m01'] LOOP
    SELECT count(*) INTO v_n
    FROM pg_inherits i JOIN pg_class c ON c.oid = i.inhrelid
    WHERE i.inhparent = 'security.audit_logs'::regclass AND c.relname = v_name;
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'AUDIT_PARTITION_CONCURRENCY_FAIL: % partition(s) named % after concurrent creation', v_n, v_name;
    END IF;
    v_month := (substr(v_name, 13, 4) || '-' || substr(v_name, 18, 2) || '-01 00:00:00+00')::timestamptz;
    PERFORM security.fn_assert_audit_log_partition(
      ('security.' || quote_ident(v_name))::regclass,
      security.fn_audit_log_month_start(v_month),
      security.fn_audit_log_next_month_start(v_month));
    EXECUTE format('DROP TABLE security.%I', v_name);
  END LOOP;
  RAISE NOTICE 'AUDIT_PARTITION_CONCURRENCY_PASS';
END $$;
'@ -AllowFailure
$summary.AuditPartitionConcurrencyVerify = $concurrencyVerify.Output
if ($concurrencyVerify.ExitCode -ne 0 -or ($concurrencyVerify.Output -join "`n") -notmatch "AUDIT_PARTITION_CONCURRENCY_PASS") {
    throw "AUDIT_PARTITION_CONCURRENCY_FAIL - post-concurrency verification did not pass:`n$($concurrencyVerify.Output -join "`n")"
}
$summary.AuditPartitionConcurrencyResult = "PASS"
Write-ArgusLog "AUDIT_PARTITION_CONCURRENCY_PASS (10 same-month + $($distinctResults.Count) distinct-month simultaneous connections, 1 CREATED per month, zero duplicate_table, zero deadlocks)"

Write-ArgusLog "=== Fase 16: prisma validate --schema prisma/schema.target.prisma ==="
Push-Location $Script:ArgusRepoRoot
try {
    $prismaOutput = Invoke-ArgusNative { & npx prisma validate --schema prisma/schema.target.prisma 2>&1 }
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
        $targetTests = Invoke-ArgusNative { & npx vitest run tests/database-target/ 2>&1 }
        $summary.TargetTestsExitCode = $LASTEXITCODE
        $summary.TargetTestsOutput = $targetTests | Select-Object -Last 20

        $p0Tests = Invoke-ArgusNative { & npx vitest run tests/p0/notifications-endpoint-auth.test.ts tests/p0/risk-assessments-endpoint-auth.test.ts 2>&1 }
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
