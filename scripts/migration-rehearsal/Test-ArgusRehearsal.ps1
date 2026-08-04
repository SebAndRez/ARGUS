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
    [switch]$SkipRepoTests,
    # Namespaces this invocation's entries in the required-phase ledger. This
    # script runs up to three times per rehearsal (1st install, post-rollback
    # reapply, from-scratch 2nd install) and each run's phases must be
    # distinguishable - otherwise a later run would overwrite an earlier one's
    # verdict and a failure could disappear from the ledger.
    [string]$PhaseScope = "FirstInstall"
)

. (Join-Path $PSScriptRoot "lib\Common.ps1")
Get-ArgusLocalEnv | Out-Null
Assert-ArgusLocalOnly

$summary = [ordered]@{
    StartedAt = (Get-Date).ToString("o")
    PhaseScope = $PhaseScope
}

function Save-ArgusTestSummary {
    param($Summary)
    if (-not (Test-Path $Script:ArgusArtifactDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null
    }
    $Summary.FinishedAt = (Get-Date).ToString("o")
    $Summary | ConvertTo-Json -Depth 6 | Set-Content -Path (Join-Path $Script:ArgusArtifactDir "test-summary.json") -Encoding utf8
}

Write-ArgusLog "=== Test-ArgusRehearsal: Fase 11 physical validations ==="
$physical = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\physical-validations.sql")
$summary.PhysicalValidations = $physical.Output
Add-ArgusPhaseResult -Name "$PhaseScope/PhysicalValidations" -ExitCode $physical.ExitCode -Passed ($physical.ExitCode -eq 0) `
    -FailureCode "PHYSICAL_VALIDATIONS_FAIL" -Evidence "physical-validations.sql exit=$($physical.ExitCode)" | Out-Null

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
# This block deliberately records rather than throws (the RLS MATRIX below is
# the throwing gate), but "recorded" used to mean "forgotten": RlsResult=FAIL
# sat in the summary while the rehearsal carried on to Success=True. It is a
# required phase now, so a FAIL here cannot coexist with a green rehearsal.
Add-ArgusPhaseResult -Name "$PhaseScope/RlsRuntimeChecks" -ExitCode $rls.ExitCode `
    -Passed ($summary.RlsResult -eq "PASS") -FailureCode "RLS_RUNTIME_CHECKS_FAIL" `
    -Evidence "rls-runtime-checks.sql exit=$($rls.ExitCode) result=$($summary.RlsResult)" | Out-Null

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
Add-ArgusPhaseResult -Name "$PhaseScope/RlsMatrix" -ExitCode $rlsMatrix.ExitCode -Passed $true `
    -Evidence "positive=$($matrixPositives.Count) negative=$($matrixNegatives.Count) role_security=$($matrixRoleSec.Count) helper_not_stub=$($matrixNotStub.Count)" | Out-Null
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
Add-ArgusPhaseResult -Name "$PhaseScope/AuditPartitionChecks" -ExitCode $auditPartition.ExitCode -Passed $true `
    -Evidence "all $($requiredAuditMarkers.Count) markers present, routing_verified=$routingOk, rls positive=$auditRlsPositive negative=$auditRlsNegative" | Out-Null
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
Add-ArgusPhaseResult -Name "$PhaseScope/AuditPartitionConcurrency" -ExitCode $concurrencyVerify.ExitCode -Passed $true `
    -Evidence "10 same-month + $($distinctResults.Count) distinct-month simultaneous connections, exactly 1 CREATED per month, zero duplicate_table/deadlock" | Out-Null
Write-ArgusLog "AUDIT_PARTITION_CONCURRENCY_PASS (10 same-month + $($distinctResults.Count) distinct-month simultaneous connections, 1 CREATED per month, zero duplicate_table, zero deadlocks)"

# ============================================================
# Persisted authorization: security.access_subjects /
# security.access_role_assignments, and the REAL principal of the canonical
# audit writer. BLOCKING.
#
# Why this is a separate step from the RLS matrix above: the matrix proves
# policy BEHAVIOUR under `SET LOCAL ROLE` inside the owner session. That is
# still useful, but it cannot prove which principal the APPLICATION CODE
# connects as — and the application code was connecting as the owner
# (superuser, BYPASSRLS, owner of the schema/table/functions), which is why
# every previous "app_api can/cannot do X" claim about the audit writer was
# unfalsifiable. The vitest suites below connect as app_api and access_admin
# over their own credentials.
# ============================================================
Write-ArgusLog "=== Persisted authorization: access subjects, assignments, classification matrix ==="
Set-ArgusRuntimeRolePasswords

$accessRole = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\access-role-checks.sql") -AllowFailure
$summary.AccessRoleChecksOutput = $accessRole.Output

$accessRoleFailures = @($accessRole.Output | Select-String -Pattern "(ACCESS|CLASSIFICATION)_[A-Z_]*FAIL")
if ($accessRoleFailures.Count -gt 0) {
    throw "ACCESS_ROLE_FAIL - access-role-checks.sql reported failures:`n$($accessRoleFailures -join "`n")"
}
if ($accessRole.ExitCode -ne 0) {
    throw "ACCESS_ROLE_FAIL - access-role-checks.sql exited $($accessRole.ExitCode); an aborted check file is not a passing check file."
}
$requiredAccessMarkers = @(
    "ACCESS_SUBJECT_INTEGRITY_PASS",
    "ACCESS_ROLE_ASSIGNMENT_PASS",
    "CLASSIFICATION_PERSISTED_ROLE_PASS",
    "CLASSIFICATION_FORGED_GUC_DENIED_PASS",
    "ACCESS_ROLE_RLS_PASS"
)
$accessRoleText = $accessRole.Output -join "`n"
foreach ($marker in $requiredAccessMarkers) {
    if ($accessRoleText -notmatch [regex]::Escape($marker)) {
        throw "ACCESS_ROLE_FAIL - required marker $marker is missing from access-role-checks.sql output."
    }
}
# A deny-everything matrix proves nothing, so both directions are counted.
$accessPositive = @($accessRole.Output | Select-String -Pattern "ACCESS_(MATRIX|ROLE_RLS)_OK \| positive").Count
$accessNegative = @($accessRole.Output | Select-String -Pattern "ACCESS_(MATRIX|ROLE_RLS)_OK \| negative").Count
$accessScoped   = @($accessRole.Output | Select-String -Pattern "ACCESS_MATRIX_OK \| (institution|purpose|emergency)").Count
if ($accessPositive -lt 4) { throw "ACCESS_ROLE_FAIL - only $accessPositive positive authorization case(s) passed; expected at least 4." }
if ($accessNegative -lt 8) { throw "ACCESS_ROLE_FAIL - only $accessNegative negative authorization case(s) passed; expected at least 8." }
if ($accessScoped   -lt 3) { throw "ACCESS_ROLE_FAIL - institution/purpose/emergency scoping was not all exercised (got $accessScoped of 3)." }
$summary.AccessRolePositivePass = $accessPositive
$summary.AccessRoleNegativePass = $accessNegative
$summary.AccessRoleResult = "PASS"
Add-ArgusPhaseResult -Name "$PhaseScope/AccessRoleChecks" -ExitCode $accessRole.ExitCode -Passed $true `
    -Evidence "positive=$accessPositive negative=$accessNegative scoped=$accessScoped, all $($requiredAccessMarkers.Count) markers present" | Out-Null
Write-ArgusLog "ACCESS_POSITIVE_PASS=$accessPositive ACCESS_NEGATIVE_PASS=$accessNegative ACCESS_SCOPED_PASS=$accessScoped"
foreach ($marker in $requiredAccessMarkers) { Write-ArgusLog $marker }

Write-ArgusLog "=== Audit writer principal + access-role suites under the REAL runtime/admin credentials ==="
# The Docker gate is enabled ONLY for this step and restored afterwards.
# Leaving ARGUS_WAVE3_INTEGRATION_TEST/TARGET_DATABASE_URL set would switch the
# Fase 17 whole-suite run into Docker mode, where the post-rollback residue
# suites (which REQUIRE a rolled-back database) run against a fully-applied one
# and fail for the wrong reason. Found exactly that way on the first full run.
# TARGET_RUNTIME_DATABASE_URL / TARGET_ADMIN_DATABASE_URL come from
# .env.argus-migration.local via Get-ArgusLocalEnv - app_api and access_admin,
# never the owner.
$principalSuites = @(
    "tests/database-target/audit-writer-principal.test.ts",
    "tests/database-target/audit-writer-no-owner-runtime.test.ts",
    "tests/database-target/access-subject.test.ts",
    "tests/database-target/access-subject-exclusivity.test.ts",
    "tests/database-target/access-role-assignment.test.ts",
    "tests/database-target/access-role-assignment-idempotency.test.ts",
    "tests/database-target/access-role-assignment-expiry.test.ts",
    "tests/database-target/access-role-assignment-revocation.test.ts",
    "tests/database-target/classification-with-persisted-role.test.ts",
    "tests/database-target/classification-rejects-forged-guc.test.ts",
    "tests/database-target/classification-institution-scope.test.ts",
    "tests/database-target/classification-purpose.test.ts",
    "tests/database-target/classification-emergency-basis.test.ts",
    "tests/database-target/access-role-rls.test.ts"
)
$principalRun = Invoke-ArgusBlockingCommand -Phase "$PhaseScope/AuditWriterPrincipal" `
    -Command "npx" -Arguments (@("vitest", "run") + $principalSuites) `
    -FailureCode "AUDIT_WRITER_PRINCIPAL_FAIL" -TimeoutSeconds 1800 `
    -Environment @{
        ARGUS_WAVE3_INTEGRATION_TEST = "true"
        TARGET_DATABASE_URL          = $env:DATABASE_URL
    }
$summary.AuditWriterPrincipalTestsExitCode = $principalRun.ExitCode
$summary.AuditWriterPrincipalTestsOutput = $principalRun.Output | Select-Object -Last 25
# Nothing may SKIP here: a skipped suite would mean the runtime credentials were
# absent, which is exactly the condition that previously let the owner stand in
# for the runtime unnoticed. Every named file must also have been collected.
Assert-ArgusVitestCoverage -Phase "$PhaseScope/AuditWriterPrincipal" -Output $principalRun.Output `
    -FailureCode "AUDIT_WRITER_PRINCIPAL_FAIL" -MinFiles $principalSuites.Count -MinTests 1 `
    -MaxSkippedFiles 0 -MaxSkippedTests 0 | Out-Null
$summary.AuditWriterPrincipalResult = "PASS"
Add-ArgusPhaseResult -Name "$PhaseScope/AuditWriterPrincipal" -ExitCode $principalRun.ExitCode -Passed $true `
    -Evidence "$($principalSuites.Count) runtime-principal/access-role suites under app_api/access_admin, zero skipped" | Out-Null
Write-ArgusLog "AUDIT_WRITER_PRINCIPAL_PASS"

# ============================================================
# R31 — incident -> operational zone -> jurisdiction -> command scope.
# BLOCKING.
#
# Separate from the RLS matrix above because it asserts a different KIND of
# claim: the matrix proves policy behaviour, this proves that AUTHORIZATION
# ITSELF now resolves through a persisted relation — that PRIMARY/AFFECTED/
# MONITORING grant nothing, that no spatial intersection ever reaches COMMAND,
# and that a jurisdictional mismatch is refused.
# ============================================================
Write-ArgusLog "=== R31: incident/zone/jurisdiction relation, command matrix, spatial resolution ==="
$incidentZone = Invoke-ArgusPsql -SqlFile (Join-Path $PSScriptRoot "sql\incident-zone-checks.sql") -AllowFailure
$summary.IncidentZoneChecksOutput = $incidentZone.Output

$incidentZoneFailures = @($incidentZone.Output | Select-String -Pattern "(INCIDENT_ZONE|INCIDENT_COMMAND|SPATIAL_RESOLUTION)_[A-Z_]*FAIL")
if ($incidentZoneFailures.Count -gt 0) {
    throw "INCIDENT_ZONE_FAIL - incident-zone-checks.sql reported failures:`n$($incidentZoneFailures -join "`n")"
}
if ($incidentZone.ExitCode -ne 0) {
    throw "INCIDENT_ZONE_FAIL - incident-zone-checks.sql exited $($incidentZone.ExitCode); an aborted check file is not a passing check file."
}
# A missing marker is as much a failure as an explicit FAIL: it means the
# assertion never ran (aborted file, skipped block, renamed marker).
$requiredIncidentZoneMarkers = @(
    "INCIDENT_ZONE_RELATION_PASS",
    "INCIDENT_ZONE_PRIMARY_UNIQUE_PASS",
    "INCIDENT_ZONE_SPATIAL_RESOLUTION_PASS",
    "SPATIAL_RESOLUTION_NO_COMMAND_PASS",
    "INCIDENT_COMMAND_ZONE_PASS",
    "INCIDENT_COMMAND_JURISDICTION_PASS",
    "INCIDENT_COMMAND_MISMATCH_DENIED_PASS",
    "INCIDENT_COMMAND_REVOKED_DENIED_PASS",
    "INCIDENT_ZONE_RLS_PASS"
)
$incidentZoneText = $incidentZone.Output -join "`n"
foreach ($marker in $requiredIncidentZoneMarkers) {
    if ($incidentZoneText -notmatch [regex]::Escape($marker)) {
        throw "INCIDENT_ZONE_FAIL - required marker $marker is missing from incident-zone-checks.sql output."
    }
}
# Both directions are counted: a deny-everything matrix would satisfy every
# negative case above while proving that the mechanism grants nothing at all.
$zonePositive   = @($incidentZone.Output | Select-String -Pattern "INCIDENT_ZONE_OK \| positive").Count
$zoneNegative   = @($incidentZone.Output | Select-String -Pattern "INCIDENT_ZONE_OK \| negative").Count
$zoneStructure  = @($incidentZone.Output | Select-String -Pattern "INCIDENT_ZONE_OK \| structure").Count
$zoneRoleSec    = @($incidentZone.Output | Select-String -Pattern "INCIDENT_ZONE_OK \| role_security").Count
if ($zonePositive  -lt 8)  { throw "INCIDENT_ZONE_FAIL - only $zonePositive positive case(s) passed; expected at least 8." }
if ($zoneNegative  -lt 20) { throw "INCIDENT_ZONE_FAIL - only $zoneNegative negative case(s) passed; expected at least 20." }
if ($zoneStructure -lt 14) { throw "INCIDENT_ZONE_FAIL - only $zoneStructure structural assertion(s) passed; expected at least 14." }
if ($zoneRoleSec   -lt 2)  { throw "INCIDENT_ZONE_FAIL - role-security preconditions did not pass." }
$summary.IncidentZonePositivePass  = $zonePositive
$summary.IncidentZoneNegativePass  = $zoneNegative
$summary.IncidentZoneStructurePass = $zoneStructure
$summary.IncidentZoneResult        = "PASS"
Add-ArgusPhaseResult -Name "$PhaseScope/IncidentZoneChecks" -ExitCode $incidentZone.ExitCode -Passed $true `
    -Evidence "positive=$zonePositive negative=$zoneNegative structure=$zoneStructure role_security=$zoneRoleSec, all $($requiredIncidentZoneMarkers.Count) markers present" | Out-Null
Write-ArgusLog "INCIDENT_ZONE_POSITIVE_PASS=$zonePositive INCIDENT_ZONE_NEGATIVE_PASS=$zoneNegative INCIDENT_ZONE_STRUCTURE_PASS=$zoneStructure"
foreach ($marker in $requiredIncidentZoneMarkers) { Write-ArgusLog $marker }

Write-ArgusLog "=== R31 suites under the REAL runtime/admin credentials ==="
# Same Docker-gate discipline as the audit-writer block above: enabled only for
# this step and restored afterwards, so the Fase 17 whole-suite run is not
# switched into Docker mode (where the post-rollback residue suites would run
# against a fully-applied database and fail for the wrong reason).
$zoneSuites = @(
    "tests/database-target/incident-operational-zone-assignment.test.ts",
    "tests/database-target/incident-operational-zone-primary-unique.test.ts",
    "tests/database-target/incident-operational-zone-command.test.ts",
    "tests/database-target/incident-operational-zone-revocation.test.ts",
    "tests/database-target/incident-operational-zone-idempotency.test.ts",
    "tests/database-target/incident-operational-zone-concurrency.test.ts",
    "tests/database-target/incident-zone-spatial-resolution.test.ts",
    "tests/database-target/spatial-resolution-never-grants-command.test.ts",
    "tests/database-target/incident-command-jurisdiction.test.ts",
    "tests/database-target/incident-command-jurisdiction-mismatch.test.ts",
    "tests/database-target/incident-command-without-command-zone.test.ts",
    "tests/database-target/incident-primary-does-not-grant-command.test.ts",
    "tests/database-target/incident-affected-does-not-grant-command.test.ts",
    "tests/database-target/incident-command-membership-expiry.test.ts",
    "tests/database-target/incident-command-role-expiry.test.ts",
    "tests/database-target/incident-command-institution.test.ts",
    "tests/database-target/incident-command-forged-context.test.ts",
    "tests/database-target/incident-candidate-zone-promotion.test.ts",
    "tests/database-target/incident-zone-rls.test.ts"
)
$zoneRun = Invoke-ArgusBlockingCommand -Phase "$PhaseScope/IncidentZoneTests" `
    -Command "npx" -Arguments (@("vitest", "run") + $zoneSuites) `
    -FailureCode "INCIDENT_ZONE_TESTS_FAIL" -TimeoutSeconds 1800 `
    -Environment @{
        ARGUS_WAVE3_INTEGRATION_TEST = "true"
        TARGET_DATABASE_URL          = $env:DATABASE_URL
    }
$summary.IncidentZoneTestsExitCode = $zoneRun.ExitCode
$summary.IncidentZoneTestsOutput = $zoneRun.Output | Select-Object -Last 25
# Nothing may SKIP here: a skipped suite means the runtime credentials were
# absent, which is exactly the condition that would let the owner stand in for
# the runtime unnoticed.
Assert-ArgusVitestCoverage -Phase "$PhaseScope/IncidentZoneTests" -Output $zoneRun.Output `
    -FailureCode "INCIDENT_ZONE_TESTS_FAIL" -MinFiles $zoneSuites.Count -MinTests 1 `
    -MaxSkippedFiles 0 -MaxSkippedTests 0 | Out-Null
$summary.IncidentZoneTestsResult = "PASS"
Add-ArgusPhaseResult -Name "$PhaseScope/IncidentZoneTests" -ExitCode $zoneRun.ExitCode -Passed $true `
    -Evidence "$($zoneSuites.Count) R31 suites under app_api/access_admin, zero skipped" | Out-Null
Write-ArgusLog "INCIDENT_ZONE_TESTS_PASS"

# ============================================================
# Fase 16 (prisma validate) and Fase 17 (repo test suites). ALL BLOCKING.
#
# This block is the defect this whole file was rewritten around. It used to
# read:
#
#     $targetTests = Invoke-ArgusNative { & npx vitest run tests/database-target/ }
#     $summary.TargetTestsExitCode = $LASTEXITCODE
#
# ...and then never compared TargetTestsExitCode to zero. A red target suite
# was RECORDED and immediately forgotten, so the rehearsal went on to roll
# back, reinstall, and report Success=True with failing tests in the summary
# it had just written. The same was true of PrismaValidateExitCode and of the
# P0 exit code.
#
# Every command below now goes through Invoke-ArgusBlockingCommand, which
# throws on a non-zero exit and returns nothing at all - there is no way to
# reach the line after it without the command having exited zero. The exit
# code is asserted BEFORE any subsequent command runs, and the recorded
# verdict lands in the required-phase ledger that Success is derived from.
# ============================================================
$activePhase = $null
try {
    Write-ArgusLog "=== Fase 16: prisma validate --schema prisma/schema.target.prisma ==="
    $activePhase = "$PhaseScope/PrismaValidate"
    $prismaRun = Invoke-ArgusBlockingCommand -Phase "$PhaseScope/PrismaValidate" `
        -Command "npm" -Arguments @("run", "db:target:validate") `
        -FailureCode "PRISMA_TARGET_VALIDATE_FAILED" -TimeoutSeconds 600
    $summary.PrismaValidateExitCode = $prismaRun.ExitCode
    $summary.PrismaValidateOutput = $prismaRun.Output
    if (($prismaRun.Output -join "`n") -notmatch "is valid") {
        throw "PRISMA_TARGET_VALIDATE_FAILED - prisma validate exited 0 without reporting the schema valid."
    }
    $summary.PrismaValidateResult = "PASS"
    Add-ArgusPhaseResult -Name "$PhaseScope/PrismaValidate" -ExitCode $prismaRun.ExitCode -Passed $true `
        -Evidence "prisma validate --schema prisma/schema.target.prisma reported the schema valid" | Out-Null

    if (-not $SkipRepoTests) {
        # ---- Fase 17a: the whole tests/database-target suite. BLOCKING. ----
        #
        # Coverage rule for THIS phase: every *.test.ts file on disk must be
        # collected (the count is read from disk, never hardcoded, so the
        # assertion grows with the suite). Skips ARE permitted here and only
        # here: the Docker gate is deliberately off for this run so the
        # post-rollback residue suites are not executed against a
        # fully-applied database. The Docker-covered assertions are proven by
        # the gated phases above, each of which forbids skips outright.
        Write-ArgusLog "=== Fase 17: repo test suites (target / P0) - BLOCKING ==="
        $activePhase = "$PhaseScope/TargetTests"
        $targetFileCount = Get-ArgusTestFileCount "tests/database-target"
        $targetInvocation = Resolve-ArgusPhaseCommand -Phase "$PhaseScope/TargetTests" `
            -Command "npm" -Arguments @("run", "db:target:test")
        $targetRun = Invoke-ArgusBlockingCommand -Phase "$PhaseScope/TargetTests" `
            -Command $targetInvocation.Command -Arguments $targetInvocation.Arguments `
            -FailureCode "TARGET_TESTS_FAILED" -TimeoutSeconds 2700
        $summary.TargetTestsExitCode = $targetRun.ExitCode
        $summary.TargetTestsOutput = $targetRun.Output | Select-Object -Last 20

        $targetCoverage = Assert-ArgusVitestCoverage -Phase "$PhaseScope/TargetTests" `
            -Output $targetRun.Output -FailureCode "TARGET_TESTS_FAILED" `
            -MinFiles $targetFileCount -MinTests 1
        $summary.TargetTestsFiles = $targetCoverage.FilesTotal
        $summary.TargetTestsPassed = $targetCoverage.TestsPassed
        $summary.TargetTestsSkipped = $targetCoverage.TestsSkipped
        $summary.TargetTests = "PASS"
        Add-ArgusPhaseResult -Name "$PhaseScope/TargetTests" -ExitCode $targetRun.ExitCode -Passed $true `
            -Evidence "npm run db:target:test: $($targetCoverage.FilesTotal) files (>= $targetFileCount on disk), $($targetCoverage.TestsPassed) passed, $($targetCoverage.TestsSkipped) skipped, 0 failed" | Out-Null
        Write-ArgusLog "TARGET_TESTS_BLOCKING_PASS files=$($targetCoverage.FilesTotal) tests=$($targetCoverage.TestsPassed) skipped=$($targetCoverage.TestsSkipped)"

        # ---- Fase 17b: the CANONICAL P0 suite. BLOCKING. ----
        #
        # `npm run test:p0` = `vitest run tests/p0`, i.e. the whole directory.
        # This used to be `npx vitest run tests/p0/notifications-endpoint-auth
        # .test.ts tests/p0/risk-assessments-endpoint-auth.test.ts` - two files,
        # 20 tests, which is where the "P0 20/20" figure came from while the
        # real P0 suite is 37 files / 322 tests. The reduced glob is gone; the
        # rehearsal and CI now invoke the same npm script, and the file count
        # is read from disk so adding a P0 file cannot silently escape it.
        # Nothing in tests/p0 is Docker-gated, so zero skips are tolerated.
        $activePhase = "$PhaseScope/P0Tests"
        $p0FileCount = Get-ArgusTestFileCount "tests/p0"
        $p0Invocation = Resolve-ArgusPhaseCommand -Phase "$PhaseScope/P0Tests" `
            -Command "npm" -Arguments @("run", "test:p0")
        $p0Run = Invoke-ArgusBlockingCommand -Phase "$PhaseScope/P0Tests" `
            -Command $p0Invocation.Command -Arguments $p0Invocation.Arguments `
            -FailureCode "P0_TESTS_FAILED" -TimeoutSeconds 1800
        $summary.P0TestsExitCode = $p0Run.ExitCode
        $summary.P0TestsOutput = $p0Run.Output | Select-Object -Last 20

        $p0Coverage = Assert-ArgusVitestCoverage -Phase "$PhaseScope/P0Tests" `
            -Output $p0Run.Output -FailureCode "P0_TESTS_FAILED" `
            -MinFiles $p0FileCount -MinTests 1 -MaxSkippedFiles 0 -MaxSkippedTests 0
        $summary.P0_FILES = $p0Coverage.FilesTotal
        $summary.P0_TESTS = $p0Coverage.TestsPassed
        $summary.P0_SKIPPED = $p0Coverage.TestsSkipped
        $summary.P0_EXIT_CODE = $p0Run.ExitCode
        $summary.P0Tests = "PASS"
        Add-ArgusPhaseResult -Name "$PhaseScope/P0Tests" -ExitCode $p0Run.ExitCode -Passed $true `
            -Evidence "npm run test:p0: P0_FILES=$($p0Coverage.FilesTotal) (all $p0FileCount on disk) P0_TESTS=$($p0Coverage.TestsPassed) P0_SKIPPED=$($p0Coverage.TestsSkipped) P0_EXIT_CODE=$($p0Run.ExitCode)" | Out-Null
        Write-ArgusLog "P0_CANONICAL_SUITE_PASS P0_FILES=$($p0Coverage.FilesTotal) P0_TESTS=$($p0Coverage.TestsPassed) P0_SKIPPED=$($p0Coverage.TestsSkipped) P0_EXIT_CODE=$($p0Run.ExitCode)"
    }
} catch {
    # The summary must name the phase that failed, so it is written here BEFORE
    # the failure propagates. The ledger records a real FAILURE rather than
    # simply having no entry, so the difference between "ran and failed" and
    # "never ran" stays visible in the final report.
    #
    # Two distinct failure shapes reach here and both must be recorded:
    #   * the command exited non-zero (Invoke-ArgusBlockingCommand threw), and
    #   * the command exited ZERO but the suite proved nothing
    #     (Assert-ArgusVitestCoverage threw: empty suite, missing files,
    #     forbidden skips). The second is why the exit code alone is not the
    #     verdict.
    $failed = Get-ArgusLastCommandResult
    $failedExit = if ($failed -and $failed.Phase -eq $activePhase) { $failed.ExitCode } else { -1 }
    if ($activePhase) {
        Add-ArgusPhaseResult -Name $activePhase -ExitCode $failedExit -Passed $false `
            -FailureCode ($_.Exception.Message -replace '\s.*$', '') `
            -Evidence "exit $failedExit : $($_.Exception.Message)" | Out-Null
        switch -Wildcard ($activePhase) {
            "*/TargetTests"    { $summary.TargetTests = "FAIL"; $summary.TargetTestsExitCode = $failedExit }
            "*/P0Tests"        { $summary.P0Tests = "FAIL"; $summary.P0_EXIT_CODE = $failedExit }
            "*/PrismaValidate" { $summary.PrismaValidateResult = "FAIL"; $summary.PrismaValidateExitCode = $failedExit }
        }
    }
    $summary.RepoTestsError = $_.Exception.Message
    Save-ArgusTestSummary $summary
    throw
}

Save-ArgusTestSummary $summary

return $summary
