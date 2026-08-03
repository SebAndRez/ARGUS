# Shared helpers for the ARGUS local migration rehearsal scripts.
# Dot-sourced by every script in scripts/migration-rehearsal/ - never run directly.
#
# Every function that talks to Postgres routes through Invoke-ArgusPsql, which
# calls Assert-ArgusLocalOnly first. There is no code path in this file that
# reaches psql without that guard running immediately before it.

$ErrorActionPreference = "Stop"

$Script:ArgusRepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
$Script:ArgusLogDir = Join-Path $Script:ArgusRepoRoot "migration-rehearsal-logs"
$Script:ArgusArtifactDir = Join-Path $Script:ArgusRepoRoot "migration-rehearsal-artifacts"
$Script:ArgusEnvLocalFile = Join-Path $Script:ArgusRepoRoot ".env.argus-migration.local"
$Script:ArgusComposeFile = Join-Path $Script:ArgusRepoRoot "docker-compose.argus-migration.yml"
$Script:ArgusContainerName = "argus_migration_rehearsal_pg"
$Script:ArgusPrivateDocsDir = Join-Path $Script:ArgusRepoRoot "docs\architecture\private"

function Invoke-ArgusNative {
    <#
    Runs a native command that may write routine progress/status output to
    stderr (docker, npx, ...). PowerShell 5.1 wraps redirected native stderr
    lines (2>&1) in ErrorRecord objects, and with $ErrorActionPreference =
    "Stop" (set above) the first such line throws a terminating error even
    when the command's real exit code is 0 - this is what aborted
    `docker compose pull` on its own progress output ("Pulling", "Downloading").
    Runs the scriptblock under ErrorActionPreference = "Continue" so stderr
    lines are captured as plain text instead, then restores "Stop". Callers
    still check $LASTEXITCODE themselves.
    #>
    param([Parameter(Mandatory)][scriptblock]$ScriptBlock)
    $previous = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $ScriptBlock
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Write-ArgusLog {
    param(
        [Parameter(Mandatory)][string]$Message,
        [string]$Level = "INFO"
    )
    if (-not (Test-Path $Script:ArgusLogDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusLogDir | Out-Null
    }
    $timestamp = (Get-Date).ToString("yyyy-MM-ddTHH:mm:ss.fffK")
    $line = "[$timestamp] [$Level] $Message"
    Write-Host $line
    Add-Content -Path (Join-Path $Script:ArgusLogDir "rehearsal.log") -Value $line -Encoding utf8
}

function New-ArgusLocalPassword {
    # 32 alnum chars - safe unescaped inside a postgresql:// URL and inside
    # docker-compose env interpolation, no URL-encoding edge cases.
    $bytes = New-Object byte[] 32
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $rng.GetBytes($bytes)
    }
    finally {
        $rng.Dispose()
    }
    $chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
    $sb = New-Object System.Text.StringBuilder
    foreach ($b in $bytes) { [void]$sb.Append($chars[$b % $chars.Length]) }
    return $sb.ToString()
}

function New-ArgusEnvLocalFile {
    # Generates a fresh local-only env file. Never reuses a password across
    # runs. Never written to a tracked path (.env.argus-migration.local is
    # excluded via .git/info/exclude, not .gitignore, per the mandate).
    $password = New-ArgusLocalPassword
    $port = 55432
    $dbName = "argus_migration_rehearsal"
    $user = "argus_rehearsal_user"
    $databaseUrl = "postgresql://$user`:$password@127.0.0.1:$port/$dbName"

    # Separate, least-privilege credentials for the RUNTIME and ADMIN
    # principals. Before this, every target-client test connected with the
    # container owner (a superuser with BYPASSRLS that owns the schema, the
    # tables and the SECURITY DEFINER functions) — which meant no RLS policy and
    # no function grant was ever actually exercised by the code under test, and
    # made "app_api can do X" claims unfalsifiable. These two URLs are what the
    # audit writer and the assignment administrator use.
    $appPassword = New-ArgusLocalPassword
    $adminPassword = New-ArgusLocalPassword

    $lines = @(
        "ARGUS_MIGRATION_LOCAL_ONLY=true",
        "POSTGRES_HOST=127.0.0.1",
        "POSTGRES_PORT=$port",
        "POSTGRES_DB=$dbName",
        "POSTGRES_USER=$user",
        "POSTGRES_PASSWORD=$password",
        "DATABASE_URL=$databaseUrl",
        "ARGUS_APP_API_PASSWORD=$appPassword",
        "ARGUS_ACCESS_ADMIN_PASSWORD=$adminPassword",
        "TARGET_RUNTIME_DATABASE_URL=postgresql://app_api`:$appPassword@127.0.0.1:$port/$dbName",
        "TARGET_ADMIN_DATABASE_URL=postgresql://access_admin`:$adminPassword@127.0.0.1:$port/$dbName"
    )
    Set-Content -Path $Script:ArgusEnvLocalFile -Value $lines -Encoding utf8 -NoNewline:$false
    Write-ArgusLog "Generated fresh .env.argus-migration.local (password not logged)."
    return Get-ArgusLocalEnv
}

function Get-ArgusLocalEnv {
    if (-not (Test-Path $Script:ArgusEnvLocalFile)) {
        throw ".env.argus-migration.local not found - call New-ArgusEnvLocalFile first."
    }
    $envMap = @{}
    Get-Content $Script:ArgusEnvLocalFile | ForEach-Object {
        if ($_ -match '^\s*#' -or $_ -match '^\s*$') { return }
        $idx = $_.IndexOf('=')
        if ($idx -lt 0) { return }
        $key = $_.Substring(0, $idx)
        $value = $_.Substring($idx + 1)
        $envMap[$key] = $value
        Set-Item -Path "Env:$key" -Value $value
    }
    return $envMap
}

function Assert-ArgusLocalOnly {
    # Delegates to the Node guard (tested by
    # tests/database-target/target-migration-rehearsal-local-only-guard.test.ts)
    # so the same logic is exercised by CI and by every real psql call here.
    $guardScript = Join-Path $PSScriptRoot "assert-local-only.mjs"
    & node $guardScript
    if ($LASTEXITCODE -ne 0) {
        throw "ARGUS_MIGRATION_REMOTE_GUARD_VIOLATION - refusing to proceed. See stderr above."
    }
    Write-ArgusLog "LOCAL_ONLY=true HOST=$($env:POSTGRES_HOST) PORT=$($env:POSTGRES_PORT) DATABASE=$($env:POSTGRES_DB) REMOTE_CONNECTION=false"
}

function Invoke-ArgusPsql {
    <#
    Runs a .sql file or inline SQL text inside the rehearsal container via
    `docker exec -i`. Never runs against a host-installed psql, so the
    container is the only thing that ever sees the password.
    #>
    param(
        [string]$SqlFile,
        [string]$SqlText,
        [string]$Database = $env:POSTGRES_DB,
        [switch]$AllowFailure
    )
    Assert-ArgusLocalOnly

    if (-not $SqlFile -and -not $SqlText) {
        throw "Invoke-ArgusPsql requires either -SqlFile or -SqlText."
    }

    $psqlArgs = @(
        "exec", "-i",
        "-e", "PGPASSWORD=$($env:POSTGRES_PASSWORD)",
        $Script:ArgusContainerName,
        "psql", "-U", $env:POSTGRES_USER, "-d", $Database,
        "-v", "ON_ERROR_STOP=1", "--no-psqlrc"
    )

    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    if ($SqlFile) {
        if (-not (Test-Path $SqlFile)) { throw "SQL file not found: $SqlFile" }
        $output = Invoke-ArgusNative { Get-Content -Raw -Path $SqlFile | & docker @psqlArgs 2>&1 }
    } else {
        $output = Invoke-ArgusNative { $SqlText | & docker @psqlArgs 2>&1 }
    }
    $exitCode = $LASTEXITCODE
    $sw.Stop()

    $label = if ($SqlFile) { Split-Path $SqlFile -Leaf } else { "<inline>" }
    Write-ArgusLog "psql $label -> exit=$exitCode duration=$($sw.Elapsed.TotalSeconds)s"
    if ($output) {
        Add-Content -Path (Join-Path $Script:ArgusLogDir "psql-output.log") -Value "----- $label ($(Get-Date -Format o)) -----`n$output" -Encoding utf8
    }

    if ($exitCode -ne 0 -and -not $AllowFailure) {
        Write-ArgusLog "psql FAILED on $label (exit $exitCode). Output tail:`n$($output | Select-Object -Last 40 | Out-String)" -Level "ERROR"
        throw "psql failed on $label (exit $exitCode) - see migration-rehearsal-logs/psql-output.log"
    }

    return [pscustomobject]@{
        File       = $label
        ExitCode   = $exitCode
        DurationMs = $sw.Elapsed.TotalMilliseconds
        Output     = $output
    }
}

function Set-ArgusRuntimeRolePasswords {
    <#
    Assigns the generated local-only passwords to app_api and access_admin so
    the target Prisma client can connect AS THOSE ROLES instead of as the
    container owner. Passwords are environment, not schema, so they are set
    here and never in prisma/target-migrations/* — a migration that hardcoded
    a credential would be a credential in version control.

    Idempotent, and a no-op with a clear log line when the roles do not exist
    yet (i.e. before wave 000 has applied).
    #>
    Assert-ArgusLocalOnly
    $appPassword = $env:ARGUS_APP_API_PASSWORD
    $adminPassword = $env:ARGUS_ACCESS_ADMIN_PASSWORD
    if (-not $appPassword -or -not $adminPassword) {
        throw "ARGUS_APP_API_PASSWORD/ARGUS_ACCESS_ADMIN_PASSWORD missing from .env.argus-migration.local - regenerate it with Reset-ArgusRehearsal.ps1."
    }
    # Passwords are interpolated into a DO block as dollar-quoted literals, so
    # they never reach the log and never need shell escaping. The generator only
    # produces [A-Za-z0-9], so no quoting edge case exists.
    $sql = @"
DO `$outer`$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_api') THEN
    EXECUTE format('ALTER ROLE app_api LOGIN PASSWORD %L', `$pw`$$appPassword`$pw`$);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'access_admin') THEN
    EXECUTE format('ALTER ROLE access_admin LOGIN PASSWORD %L', `$pw`$$adminPassword`$pw`$);
  END IF;
END
`$outer`$;
"@
    Invoke-ArgusPsql -SqlText $sql | Out-Null
    Write-ArgusLog "Runtime role passwords set for app_api / access_admin (values not logged)."
}

function Get-ArgusWaveList {
    $waveRoot = Join-Path $Script:ArgusRepoRoot "prisma\target-migrations"
    Get-ChildItem -Path $waveRoot -Directory | Sort-Object Name | ForEach-Object { $_.FullName }
}

function Get-ArgusCatalogSnapshot {
    # One consolidated read-only query set covering Fase 7/11's checklist:
    # schemas, tables, enums, views, matviews, functions, triggers, roles,
    # RLS/FORCE RLS, policies, indexes, constraints, extensions, partitions.
    $sql = @'
\pset format unaligned
\pset tuples_only off
SELECT 'SCHEMAS' AS section, string_agg(schema_name, ',' ORDER BY schema_name) FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog','information_schema','pg_toast');
SELECT 'TABLES' AS section, count(*)::text FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema');
SELECT 'ENUMS' AS section, count(*)::text FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE t.typtype='e' AND n.nspname NOT IN ('pg_catalog','information_schema');
SELECT 'VIEWS' AS section, count(*)::text FROM pg_views WHERE schemaname NOT IN ('pg_catalog','information_schema');
SELECT 'MATVIEWS' AS section, count(*)::text FROM pg_matviews;
SELECT 'FUNCTIONS' AS section, count(*)::text FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema');
SELECT 'TRIGGERS' AS section, count(*)::text FROM pg_trigger WHERE NOT tgisinternal;
SELECT 'ROLES' AS section, string_agg(rolname, ',' ORDER BY rolname) FROM pg_roles WHERE rolname NOT LIKE 'pg\_%';
SELECT 'RLS_ENABLED_TABLES' AS section, count(*)::text FROM pg_class WHERE relrowsecurity;
SELECT 'FORCE_RLS_TABLES' AS section, count(*)::text FROM pg_class WHERE relforcerowsecurity;
SELECT 'POLICIES' AS section, count(*)::text FROM pg_policy;
SELECT 'INDEXES' AS section, count(*)::text FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog','information_schema');
SELECT 'CHECK_CONSTRAINTS' AS section, count(*)::text FROM pg_constraint WHERE contype='c';
SELECT 'UNIQUE_CONSTRAINTS' AS section, count(*)::text FROM pg_constraint WHERE contype='u';
SELECT 'FK_CONSTRAINTS' AS section, count(*)::text FROM pg_constraint WHERE contype='f';
SELECT 'EXCLUSION_CONSTRAINTS' AS section, count(*)::text FROM pg_constraint WHERE contype='x';
SELECT 'EXTENSIONS' AS section, string_agg(extname, ',' ORDER BY extname) FROM pg_extension;
SELECT 'BYPASSRLS_ROLES' AS section, coalesce(string_agg(rolname, ','), '(none)') FROM pg_roles WHERE rolbypassrls AND rolname NOT LIKE 'pg\_%';
'@
    return Invoke-ArgusPsql -SqlText $sql -AllowFailure
}

function Wait-ArgusPostgresHealthy {
    <#
    Waits until the container is healthy AND actually answers a query.

    The second half is not redundant. The postgres image runs a TEMPORARY
    server during initdb, shuts it down, then starts the real one — and
    `pg_isready` can report healthy against that temporary server, so the very
    next statement fails with "the database system is shutting down". Observed
    exactly that way on a Fase 15 reset.

    The probe is `postgis_full_version()` and not `SELECT 1` deliberately: the
    temporary server ACCEPTS CONNECTIONS too, so `SELECT 1` succeeds against it
    and proves nothing — that was the second false start, where the probe
    passed and the very next statement died on "function postgis_full_version()
    does not exist". PostGIS is created by the image's initdb scripts, so its
    presence is the first observable moment at which the database is the one
    this harness actually needs. Probing for the required capability, rather
    than for liveness, is what makes the wait meaningful.
    #>
    param([int]$TimeoutSeconds = 120)
    Assert-ArgusLocalOnly
    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    $healthy = $false
    while ((Get-Date) -lt $deadline) {
        $status = & docker inspect --format='{{.State.Health.Status}}' $Script:ArgusContainerName 2>$null
        if ($status -eq "healthy") {
            $healthy = $true
            Write-ArgusLog "Postgres healthcheck: healthy."
            break
        }
        Start-Sleep -Seconds 3
    }
    if (-not $healthy) {
        throw "Postgres did not become healthy within $TimeoutSeconds s - see 'docker compose -f $Script:ArgusComposeFile logs'."
    }

    while ((Get-Date) -lt $deadline) {
        $probe = Invoke-ArgusPsql -SqlText "SELECT postgis_full_version();" -AllowFailure
        if ($probe.ExitCode -eq 0) {
            Write-ArgusLog "Postgres is serving and PostGIS is available."
            return $true
        }
        Write-ArgusLog "Postgres healthy but PostGIS not available yet (exit $($probe.ExitCode)) - still initializing, retrying." "WARN"
        Start-Sleep -Seconds 3
    }
    throw "Postgres reported healthy but PostGIS never became available within $TimeoutSeconds s - see 'docker compose -f $Script:ArgusComposeFile logs'."
}
