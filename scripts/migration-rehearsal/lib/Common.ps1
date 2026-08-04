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

# =============================================================================
# Blocking native-command execution.
#
# Invoke-ArgusNative above solves ONE problem (PowerShell 5.1 turning a native
# command's stderr into a terminating ErrorRecord) and deliberately leaves the
# exit-code check to its callers - which is exactly how a failing test suite
# was able to coexist with Success=True: Fase 17 stored $LASTEXITCODE into the
# summary and never compared it to zero.
#
# Invoke-ArgusBlockingCommand is the single canonical way to run a native
# command in this harness. It cannot be used without asserting the exit code,
# because a non-zero exit throws and NOTHING is returned. Any code that wants a
# structured result has already proven the command succeeded.
# =============================================================================

$Script:ArgusLastCommandResult = $null

function Get-ArgusRedactedText {
    <#
    Removes credentials from anything about to be logged: URL userinfo
    (postgresql://user:password@host), PGPASSWORD=..., and the literal password
    values this harness generated for this run.
    #>
    param([string]$Text)
    if ([string]::IsNullOrEmpty($Text)) { return $Text }
    $redacted = [regex]::Replace($Text, '(?i)([a-z][a-z0-9+.\-]*://[^:/\s@]+):([^@/\s]+)@', '$1:***@')
    $redacted = [regex]::Replace($redacted, '(?i)(PGPASSWORD=)\S+', '$1***')
    foreach ($name in @("POSTGRES_PASSWORD", "ARGUS_APP_API_PASSWORD", "ARGUS_ACCESS_ADMIN_PASSWORD")) {
        $value = [Environment]::GetEnvironmentVariable($name)
        if ($value -and $value.Length -ge 8) {
            $redacted = $redacted.Replace($value, "***")
        }
    }
    return $redacted
}

function ConvertTo-ArgusArgumentString {
    # Start-Process -ArgumentList in PowerShell 5.1 flattens an array with plain
    # spaces and does not quote, so an argument containing whitespace would be
    # split into two. Quote here instead of trusting that.
    param([string[]]$Arguments = @())
    if (-not $Arguments -or $Arguments.Count -eq 0) { return "" }
    $parts = foreach ($a in $Arguments) {
        if ($a -match '[\s"]') { '"' + ([regex]::Replace($a, '(\\*)"', '$1$1\"')) + '"' } else { $a }
    }
    return ($parts -join ' ')
}

function Resolve-ArgusExecutable {
    <#
    A command that does not exist is a FAILED phase, never a skipped one - so
    this throws with the phase's own failure code rather than letting
    Start-Process raise a generic FileNotFoundException later.
    #>
    param(
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$Phase,
        [string]$FailureCode = "ARGUS_NATIVE_COMMAND_FAILED"
    )
    if ([System.IO.Path]::IsPathRooted($Command) -and (Test-Path -LiteralPath $Command -PathType Leaf)) {
        return (Resolve-Path -LiteralPath $Command).Path
    }
    $found = @(Get-Command $Command -CommandType Application -ErrorAction SilentlyContinue)
    if ($found.Count -eq 0) {
        throw "$FailureCode - phase '$Phase': executable '$Command' was not found on PATH. A missing command is a failed phase, not a skipped one."
    }
    return $found[0].Source
}

function Get-ArgusLastCommandResult {
    # The result of the most recent Invoke-ArgusBlockingCommand, INCLUDING a
    # failed one. Callers use this in their catch block to record the real exit
    # code in the summary before rethrowing - the helper itself still returns
    # nothing on failure.
    return $Script:ArgusLastCommandResult
}

function Invoke-ArgusBlockingCommand {
    <#
    .SYNOPSIS
      Runs a native command, captures stdout+stderr, preserves the real exit
      code, and THROWS if that exit code is not zero.

    .DESCRIPTION
      Contract of the returned object: Command, Arguments, ExitCode, Output,
      Duration, Phase, Success. It is returned ONLY when ExitCode is 0 - there
      is no way to obtain a result object from a failed command, so no caller
      can accidentally treat a failure as a pass.

      stdout and stderr are drained from the process object's own redirected
      streams, so no PowerShell pipeline ever sits between the command and its
      exit code (a pipeline stage after a native command is one of the ways
      $LASTEXITCODE gets lost) and $LASTEXITCODE is never consulted at all.
      Everything logged is passed through Get-ArgusRedactedText first.

      -TimeoutSeconds is explicit and always enforced: a hung suite is a failed
      phase, not an indefinitely pending one.
    #>
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Command,
        [string[]]$Arguments = @(),
        [string]$FailureCode = "ARGUS_NATIVE_COMMAND_FAILED",
        [int]$TimeoutSeconds = 1800,
        [string]$WorkingDirectory,
        [hashtable]$Environment
    )

    $exe = Resolve-ArgusExecutable -Command $Command -Phase $Phase -FailureCode $FailureCode
    if (-not $WorkingDirectory) { $WorkingDirectory = $Script:ArgusRepoRoot }
    if (-not (Test-Path $Script:ArgusLogDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusLogDir | Out-Null
    }
    $previousEnv = @{}
    if ($Environment) {
        foreach ($key in $Environment.Keys) {
            $previousEnv[$key] = [Environment]::GetEnvironmentVariable($key)
            Set-Item -Path "Env:$key" -Value $Environment[$key]
        }
    }

    $displayArgs = Get-ArgusRedactedText (ConvertTo-ArgusArgumentString $Arguments)
    Write-ArgusLog "[$Phase] exec: $Command $displayArgs (timeout ${TimeoutSeconds}s)"

    # System.Diagnostics.Process rather than Start-Process: PowerShell 5.1's
    # Start-Process -PassThru returns an object whose .ExitCode is EMPTY (the
    # handle is not retained unless -Wait is used, and -Wait cannot time out).
    # An empty exit code compared against zero is exactly the class of bug this
    # whole change exists to remove, so the exit code is read from a process
    # object this function owns end to end.
    $sw = [System.Diagnostics.Stopwatch]::StartNew()
    $exitCode = $null
    $output = @()
    $proc = New-Object System.Diagnostics.Process
    try {
        $proc.StartInfo.FileName = $exe
        $proc.StartInfo.Arguments = (ConvertTo-ArgusArgumentString $Arguments)
        $proc.StartInfo.WorkingDirectory = $WorkingDirectory
        $proc.StartInfo.UseShellExecute = $false
        $proc.StartInfo.CreateNoWindow = $true
        $proc.StartInfo.RedirectStandardOutput = $true
        $proc.StartInfo.RedirectStandardError = $true

        [void]$proc.Start()
        # Both streams are drained asynchronously BEFORE waiting: reading one to
        # the end while the other fills its pipe buffer is the classic deadlock,
        # and a deadlocked harness looks exactly like a hung test suite.
        $outTask = $proc.StandardOutput.ReadToEndAsync()
        $errTask = $proc.StandardError.ReadToEndAsync()

        if (-not $proc.WaitForExit($TimeoutSeconds * 1000)) {
            Stop-ArgusProcessTree -Process $proc
            $sw.Stop()
            $Script:ArgusLastCommandResult = [pscustomobject]@{
                Phase = $Phase; Command = $Command; Arguments = $Arguments
                ExitCode = 124; Output = @("(timed out after $TimeoutSeconds s)")
                Duration = $sw.Elapsed; Success = $false; FailureCode = $FailureCode
            }
            throw "$FailureCode - phase '$Phase': '$Command' did not finish within $TimeoutSeconds s and was terminated. A hung suite is a failed phase."
        }
        # WaitForExit(ms) returns as soon as the process object signals; the
        # parameterless overload additionally waits for the redirected streams
        # to be fully flushed.
        $proc.WaitForExit()
        $exitCode = $proc.ExitCode
        $sw.Stop()

        $stdout = $outTask.GetAwaiter().GetResult()
        $stderr = $errTask.GetAwaiter().GetResult()
        $output = @()
        if ($stdout) { $output += ($stdout -split "\r?\n") }
        if ($stderr) { $output += ($stderr -split "\r?\n") }
    } finally {
        if ($Environment) {
            foreach ($key in $previousEnv.Keys) {
                if ($null -eq $previousEnv[$key]) { Remove-Item "Env:$key" -ErrorAction SilentlyContinue }
                else { Set-Item -Path "Env:$key" -Value $previousEnv[$key] }
            }
        }
        $proc.Dispose()
    }

    $redacted = @($output | ForEach-Object { Get-ArgusRedactedText $_ })
    Add-Content -Path (Join-Path $Script:ArgusLogDir "native-commands.log") `
        -Value "----- [$Phase] $Command $displayArgs -> exit=$exitCode ($(Get-Date -Format o)) -----`n$($redacted -join "`n")" -Encoding utf8
    Write-ArgusLog "[$Phase] exit=$exitCode duration=$([math]::Round($sw.Elapsed.TotalSeconds, 1))s"

    $result = [pscustomobject]@{
        Phase       = $Phase
        Command     = $Command
        Arguments   = $Arguments
        ExitCode    = $exitCode
        Output      = $redacted
        Duration    = $sw.Elapsed
        Success     = ($exitCode -eq 0)
        FailureCode = $FailureCode
    }
    $Script:ArgusLastCommandResult = $result

    if ($exitCode -ne 0) {
        Write-ArgusLog "[$Phase] FAILED (exit $exitCode). Output tail:`n$(($redacted | Select-Object -Last 40) -join "`n")" -Level "ERROR"
        throw "$FailureCode - phase '$Phase': '$Command' exited $exitCode. Success output printed by a command that exits non-zero is still a failure."
    }
    return $result
}

function Stop-ArgusProcessTree {
    param([Parameter(Mandatory)]$Process)
    if (Get-Command taskkill -CommandType Application -ErrorAction SilentlyContinue) {
        & taskkill /T /F /PID $Process.Id 2>&1 | Out-Null
    }
    if (-not $Process.HasExited) {
        Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
    }
}

# =============================================================================
# Suite coverage.
#
# "npx vitest exited 0" is not proof that the suite ran. Zero collected tests,
# a fully-skipped Docker suite, and a suite whose gate variable was never set
# all exit 0. Every phase declares its own structural minimum instead, because
# a global "expect 881 tests" would be wrong the moment a test is added.
# =============================================================================

function Get-ArgusVitestSummary {
    <#
    Parses vitest's terminal summary:
      Test Files  80 passed | 32 skipped (112)
           Tests  881 passed | 443 skipped (1324)
    Parsed=$false means no summary was printed at all, which is itself a
    failure - a suite that never reported a result did not run.
    #>
    param([Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Output)

    $summary = [ordered]@{
        Parsed = $false
        FilesTotal = 0; FilesPassed = 0; FilesFailed = 0; FilesSkipped = 0
        TestsTotal = 0; TestsPassed = 0; TestsFailed = 0; TestsSkipped = 0
    }
    $text = ($Output -join "`n")
    $fileMatch = [regex]::Match($text, '(?m)^\s*Test Files\s+(?<body>\S.*?)\s*$')
    $testMatch = [regex]::Match($text, '(?m)^\s*Tests\s+(?<body>\S.*?)\s*$')
    if (-not $fileMatch.Success -or -not $testMatch.Success) { return [pscustomobject]$summary }

    function Get-Count { param([string]$Body, [string]$Word)
        $m = [regex]::Match($Body, "(\d+)\s+$Word")
        if ($m.Success) { return [int]$m.Groups[1].Value }
        return 0
    }
    function Get-Total { param([string]$Body)
        $m = [regex]::Match($Body, '\((\d+)\)\s*$')
        if ($m.Success) { return [int]$m.Groups[1].Value }
        return -1
    }

    $fileBody = $fileMatch.Groups['body'].Value
    $testBody = $testMatch.Groups['body'].Value
    $summary.FilesPassed  = Get-Count $fileBody 'passed'
    $summary.FilesFailed  = Get-Count $fileBody 'failed'
    $summary.FilesSkipped = Get-Count $fileBody 'skipped'
    $summary.FilesTotal   = Get-Total $fileBody
    $summary.TestsPassed  = Get-Count $testBody 'passed'
    $summary.TestsFailed  = Get-Count $testBody 'failed'
    $summary.TestsSkipped = Get-Count $testBody 'skipped'
    $summary.TestsTotal   = Get-Total $testBody
    if ($summary.FilesTotal -lt 0) { $summary.FilesTotal = $summary.FilesPassed + $summary.FilesFailed + $summary.FilesSkipped }
    if ($summary.TestsTotal -lt 0) { $summary.TestsTotal = $summary.TestsPassed + $summary.TestsFailed + $summary.TestsSkipped }
    $summary.Parsed = $true
    return [pscustomobject]$summary
}

function Assert-ArgusVitestCoverage {
    <#
    Structural coverage gate for one phase. -MinFiles is normally the number of
    *.test.ts files actually on disk for that directory, so the assertion grows
    with the suite instead of pinning a stale total.

    -MaxSkippedFiles / -MaxSkippedTests are per-phase on purpose: the Fase 17
    whole-suite run legitimately skips the Docker-gated files (documented - the
    gate is deliberately off there so the post-rollback residue suites are not
    run against a fully-applied database), whereas a Docker-gated phase that
    skips anything has silently lost the coverage it exists to provide.
    #>
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][AllowEmptyCollection()][AllowEmptyString()][string[]]$Output,
        [Parameter(Mandatory)][string]$FailureCode,
        [int]$MinFiles = 1,
        [int]$MinTests = 1,
        [int]$MaxSkippedFiles = [int]::MaxValue,
        [int]$MaxSkippedTests = [int]::MaxValue,
        [string[]]$RequiredMarkers = @()
    )
    $s = Get-ArgusVitestSummary -Output $Output
    if (-not $s.Parsed) {
        throw "$FailureCode - phase '$Phase': vitest printed no result summary. A suite that never reported a result is not a passing suite."
    }
    if ($s.TestsTotal -le 0) {
        throw "$FailureCode - phase '$Phase': zero tests were collected. An empty suite is never a pass."
    }
    if ($s.FilesTotal -lt $MinFiles) {
        throw "$FailureCode - phase '$Phase': only $($s.FilesTotal) test file(s) ran, expected at least $MinFiles. A suite that did not execute is a failure, not a skip."
    }
    if ($s.FilesFailed -gt 0 -or $s.TestsFailed -gt 0) {
        throw "$FailureCode - phase '$Phase': $($s.TestsFailed) test(s) in $($s.FilesFailed) file(s) failed."
    }
    # Skip budgets are checked BEFORE the executed-count minimum, because a
    # fully-skipped Docker suite fails both and "everything skipped" is the
    # diagnosis that names the actual cause (the gate variable or the runtime
    # credentials went missing), where "0 tests passed" does not.
    if ($s.FilesSkipped -gt $MaxSkippedFiles) {
        throw "$FailureCode - phase '$Phase': $($s.FilesSkipped) test file(s) were SKIPPED but this phase allows at most $MaxSkippedFiles. Docker coverage this phase requires was not exercised."
    }
    if ($s.TestsSkipped -gt $MaxSkippedTests) {
        throw "$FailureCode - phase '$Phase': $($s.TestsSkipped) test(s) were SKIPPED but this phase allows at most $MaxSkippedTests. Docker coverage this phase requires was not exercised."
    }
    if ($s.TestsPassed -lt $MinTests) {
        throw "$FailureCode - phase '$Phase': only $($s.TestsPassed) test(s) actually executed and passed, expected at least $MinTests."
    }
    $text = ($Output -join "`n")
    foreach ($marker in $RequiredMarkers) {
        if ($text -notmatch [regex]::Escape($marker)) {
            throw "$FailureCode - phase '$Phase': required marker $marker is missing from the suite output."
        }
    }
    Write-ArgusLog "[$Phase] files=$($s.FilesPassed)/$($s.FilesTotal) tests=$($s.TestsPassed)/$($s.TestsTotal) skipped_files=$($s.FilesSkipped) skipped_tests=$($s.TestsSkipped)"
    return $s
}

function Get-ArgusTestFileCount {
    # Structural minimum for a directory: every *.test.ts on disk must be
    # collected. Grows with the suite; never pins a number.
    param([Parameter(Mandatory)][string]$RelativePath)
    $full = Join-Path $Script:ArgusRepoRoot $RelativePath
    if (-not (Test-Path $full)) { throw "ARGUS_TEST_DIRECTORY_MISSING - $RelativePath does not exist." }
    return @(Get-ChildItem -Path $full -Recurse -File -Filter "*.test.ts").Count
}

# =============================================================================
# Required-phase ledger.
#
# Success is DERIVED from this ledger, never assigned because the script
# happened to reach the end. The ledger lives in the global scope because
# Test-ArgusRehearsal.ps1 runs as a child script (&) and must be able to
# register its phases even on the code path where it throws.
# =============================================================================

function Initialize-ArgusPhaseLedger {
    $Global:ArgusPhaseLedger = [ordered]@{}
    return $Global:ArgusPhaseLedger
}

function Get-ArgusPhaseLedger {
    if (-not $Global:ArgusPhaseLedger) { Initialize-ArgusPhaseLedger | Out-Null }
    return $Global:ArgusPhaseLedger
}

function Add-ArgusPhaseResult {
    param(
        [Parameter(Mandatory)][string]$Name,
        [bool]$Required = $true,
        [bool]$Executed = $true,
        [int]$ExitCode = 0,
        [bool]$Passed = $false,
        [string]$Evidence = "",
        [bool]$Skipped = $false,
        [string]$FailureCode = "",
        $Ledger
    )
    if (-not $Ledger) { $Ledger = Get-ArgusPhaseLedger }
    $Ledger[$Name] = [pscustomobject]@{
        Name        = $Name
        Required    = $Required
        Executed    = $Executed
        ExitCode    = $ExitCode
        Passed      = $Passed
        Evidence    = $Evidence
        Skipped     = $Skipped
        FailureCode = $FailureCode
    }
    return $Ledger[$Name]
}

function Assert-ArgusRequiredPhases {
    <#
    The single gate in front of Success=True. Every required phase must have
    been registered, executed, not skipped, exited zero and passed. A required
    phase that never registered anything is REHEARSAL_REQUIRED_PHASE_MISSING -
    silently not running a phase must be as fatal as running it and failing.
    #>
    param(
        [Parameter(Mandatory)][string[]]$RequiredPhases,
        $Ledger
    )
    if (-not $Ledger) { $Ledger = Get-ArgusPhaseLedger }
    foreach ($name in $RequiredPhases) {
        if (-not $Ledger.Contains($name)) {
            throw "REHEARSAL_REQUIRED_PHASE_MISSING - required phase '$name' never registered a result."
        }
        $p = $Ledger[$name]
        if (-not $p.Executed) {
            throw "REHEARSAL_REQUIRED_PHASE_MISSING - required phase '$name' was registered but never executed."
        }
        if ($p.Skipped) {
            throw "REHEARSAL_REQUIRED_PHASE_SKIPPED - required phase '$name' was skipped; a required phase may never be skipped."
        }
        if ($p.ExitCode -ne 0) {
            throw "REHEARSAL_REQUIRED_PHASE_FAILED - required phase '$name' exited $($p.ExitCode) ($($p.FailureCode))."
        }
        if (-not $p.Passed) {
            throw "REHEARSAL_REQUIRED_PHASE_FAILED - required phase '$name' did not pass ($($p.FailureCode))."
        }
    }
    # A required phase is also not allowed to be marked Required=$false in the
    # ledger while appearing in the required list - that would let a future
    # edit demote a phase instead of fixing it.
    foreach ($name in $RequiredPhases) {
        if (-not $Ledger[$name].Required) {
            throw "REHEARSAL_REQUIRED_PHASE_FAILED - phase '$name' is in the required set but is registered as Required=false."
        }
    }
    Write-ArgusLog "REHEARSAL_REQUIRED_PHASES_PASS ($($RequiredPhases.Count) required phases executed and passed)"
    return $true
}

# =============================================================================
# Fault injection - the harness's own test mode.
#
# The ONLY way to prove a green rehearsal means something is to demonstrate a
# red one. This replaces a phase's command with a fixture that can produce a
# failure, an empty suite, or a fully-skipped suite. There is deliberately no
# mode reachable from the environment that makes a phase PASS, so the switch
# can never be used to manufacture a green run.
# =============================================================================

$Script:ArgusFaultModes = @("fail", "empty", "skipped")

function Get-ArgusFaultCommandFixture {
    return (Join-Path $PSScriptRoot "harness-fault-command.mjs")
}

function Resolve-ArgusPhaseCommand {
    param(
        [Parameter(Mandatory)][string]$Phase,
        [Parameter(Mandatory)][string]$Command,
        [string[]]$Arguments = @()
    )
    $faultPhases = $env:ARGUS_REHEARSAL_FAULT_PHASE
    if ($faultPhases) {
        $names = @($faultPhases -split '\s*,\s*' | Where-Object { $_ })
        if ($names -contains $Phase) {
            $mode = if ($env:ARGUS_REHEARSAL_FAULT_MODE) { $env:ARGUS_REHEARSAL_FAULT_MODE } else { "fail" }
            if ($Script:ArgusFaultModes -notcontains $mode) {
                throw "ARGUS_REHEARSAL_FAULT_MODE='$mode' is not one of: $($Script:ArgusFaultModes -join ', '). There is no fault mode that makes a phase pass."
            }
            Write-ArgusLog "FAULT INJECTION ACTIVE for phase '$Phase' (mode=$mode). This run can only FAIL." -Level "WARN"
            return [pscustomobject]@{
                Command   = "node"
                Arguments = @((Get-ArgusFaultCommandFixture), $mode)
                Injected  = $true
            }
        }
    }
    return [pscustomobject]@{ Command = $Command; Arguments = $Arguments; Injected = $false }
}

function Test-ArgusFailurePropagation {
    <#
    Runs on EVERY rehearsal, before anything expensive. Proves, with the
    fixture command and never with a productive test file, that:
      1. a successful command lets the harness continue;
      2. a command that prints a green summary and exits 1 still throws;
      3. the real exit code survives;
      4. a zero-test suite is rejected;
      5. a fully-skipped suite is rejected where coverage is mandatory;
      6. a non-existent command is rejected.
    Emits REHEARSAL_FAILURE_PROPAGATION_PASS only if all six hold.
    #>
    $fixture = Get-ArgusFaultCommandFixture
    if (-not (Test-Path $fixture)) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - the harness fault fixture is missing: $fixture"
    }

    # 1 + 3: a successful command returns a structured result with exit 0.
    $ok = Invoke-ArgusBlockingCommand -Phase "SelfTest/Pass" -Command "node" -Arguments @($fixture, "pass") `
        -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" -TimeoutSeconds 120
    if (-not $ok.Success -or $ok.ExitCode -ne 0) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - a successful command did not produce a passing result."
    }
    Assert-ArgusVitestCoverage -Phase "SelfTest/Pass" -Output $ok.Output -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" `
        -MinFiles 1 -MinTests 1 -MaxSkippedFiles 0 -MaxSkippedTests 0 | Out-Null

    # 2 + 3: green text, exit 1 -> must throw, and the real exit code must be
    # visible to the caller.
    $threw = $false
    try {
        Invoke-ArgusBlockingCommand -Phase "SelfTest/Fail" -Command "node" -Arguments @($fixture, "fail") `
            -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" -TimeoutSeconds 120 | Out-Null
    } catch {
        $threw = $true
    }
    if (-not $threw) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - a command that printed a green summary and exited 1 did not stop the harness."
    }
    $last = Get-ArgusLastCommandResult
    if ($last.ExitCode -ne 1 -or $last.Success) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - the real exit code (1) was not preserved; got $($last.ExitCode)."
    }

    # 4: zero collected tests, exit 0.
    $empty = $null
    try {
        $empty = Invoke-ArgusBlockingCommand -Phase "SelfTest/Empty" -Command "node" -Arguments @($fixture, "empty") `
            -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" -TimeoutSeconds 120
    } catch {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - the empty-suite fixture must exit 0 so the coverage gate is what rejects it."
    }
    $emptyRejected = $false
    try {
        Assert-ArgusVitestCoverage -Phase "SelfTest/Empty" -Output $empty.Output -FailureCode "REHEARSAL_EMPTY_SUITE" -MinFiles 1 -MinTests 1 | Out-Null
    } catch { $emptyRejected = $true }
    if (-not $emptyRejected) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - a suite that collected zero tests was accepted."
    }

    # 5: everything skipped, exit 0, in a phase where coverage is mandatory.
    $skipped = Invoke-ArgusBlockingCommand -Phase "SelfTest/Skipped" -Command "node" -Arguments @($fixture, "skipped") `
        -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" -TimeoutSeconds 120
    $skipRejected = $false
    try {
        Assert-ArgusVitestCoverage -Phase "SelfTest/Skipped" -Output $skipped.Output -FailureCode "REHEARSAL_REQUIRED_DOCKER_SKIP" `
            -MinFiles 1 -MinTests 1 -MaxSkippedFiles 0 -MaxSkippedTests 0 | Out-Null
    } catch { $skipRejected = $true }
    if (-not $skipRejected) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - a fully-skipped Docker suite was accepted where coverage is mandatory."
    }

    # 6: a command that does not exist.
    $missingRejected = $false
    try {
        Invoke-ArgusBlockingCommand -Phase "SelfTest/Missing" -Command "argus-command-that-does-not-exist" `
            -FailureCode "REHEARSAL_FAILURE_PROPAGATION_FAIL" -TimeoutSeconds 30 | Out-Null
    } catch { $missingRejected = $true }
    if (-not $missingRejected) {
        throw "REHEARSAL_FAILURE_PROPAGATION_FAIL - a non-existent command was not rejected."
    }

    Write-ArgusLog "REHEARSAL_FAILURE_PROPAGATION_PASS (success continues; exit 1 blocks; empty suite blocks; all-skipped blocks; missing command blocks)"
    return $true
}

# =============================================================================
# Run completion: cleanup, artifacts, and the human-readable summary.
#
# Extracted from Invoke-ArgusFullRehearsal.ps1's finally block so that the
# behaviour the mandate cares about - cleanup STILL runs after a failure, and
# the summary that gets written names the failing phase and never says
# Success=True - is a function that can be exercised by a test instead of only
# by a full 40-minute Docker run.
#
# It does not throw: it converts its own problems into a FAILED run rather than
# into a warning, so a broken cleanup can never leave a green verdict standing.
# =============================================================================

function Invoke-ArgusRehearsalTeardown {
    $result = [ordered]@{ Performed = $false; ExitCode = 0; Reason = "" }
    if (-not ((Get-Command docker -CommandType Application -ErrorAction SilentlyContinue) -and
              (Test-Path $Script:ArgusComposeFile) -and
              (Test-Path $Script:ArgusEnvLocalFile))) {
        $result.Reason = "Docker, the compose file, or the local env file is unavailable - nothing to tear down."
        Write-ArgusLog "Cleanup skipped: $($result.Reason)" "WARN"
        return [pscustomobject]$result
    }
    Push-Location $Script:ArgusRepoRoot
    try {
        $down = Invoke-ArgusNative {
            & docker compose --env-file $Script:ArgusEnvLocalFile -f $Script:ArgusComposeFile down -v 2>&1
        }
        $result.ExitCode = $LASTEXITCODE
        $result.Performed = $true
        foreach ($line in @($down)) { Write-ArgusLog (Get-ArgusRedactedText $line) }
    } finally {
        Pop-Location
    }
    if (Test-Path $Script:ArgusEnvLocalFile) {
        Remove-Item -Force $Script:ArgusEnvLocalFile
        Write-ArgusLog "Removed .env.argus-migration.local."
    }
    if ($result.ExitCode -ne 0) {
        Write-ArgusLog "REHEARSAL_CLEANUP_FAILED - 'docker compose down -v' exited $($result.ExitCode); the container/volume may still exist." -Level "ERROR"
    }
    return [pscustomobject]$result
}

function Complete-ArgusRehearsalRun {
    <#
    Writes the machine-readable artifact and the private markdown summary, then
    tears the rehearsal container/volume down. Returns the (possibly demoted)
    result object. Cleanup runs whether the run passed or failed.
    #>
    param([Parameter(Mandatory)]$Result)

    $Result.FinishedAt = (Get-Date).ToString("o")

    $ledger = Get-ArgusPhaseLedger
    $Result.RequiredPhaseResults = @($ledger.Keys | ForEach-Object { $ledger[$_] })

    Write-ArgusLog "=== Fase 22: tearing down rehearsal container + volume ==="
    $cleanup = Invoke-ArgusRehearsalTeardown
    $Result.CleanupPerformed = $cleanup.Performed
    $Result.CleanupExitCode = $cleanup.ExitCode
    if ($cleanup.ExitCode -ne 0 -and $Result.Success) {
        $Result.Success = $false
        $Result.Error = "REHEARSAL_CLEANUP_FAILED - 'docker compose down -v' exited $($cleanup.ExitCode)."
    }

    # A phase verdict must never be inferred from the absence of an error, so
    # the summary reports the ledger verbatim.
    $targetPhases = @($Result.RequiredPhaseResults | Where-Object { $_.Name -like "*/TargetTests" })
    $p0Phases     = @($Result.RequiredPhaseResults | Where-Object { $_.Name -like "*/P0Tests" })
    $targetVerdict = if ($targetPhases.Count -eq 0) { "NOT RUN" }
                     elseif (@($targetPhases | Where-Object { -not $_.Passed }).Count -gt 0) { "FAIL" }
                     else { "PASS" }
    $p0Verdict = if ($p0Phases.Count -eq 0) { "NOT RUN" }
                 elseif (@($p0Phases | Where-Object { -not $_.Passed }).Count -gt 0) { "FAIL" }
                 else { "PASS" }
    $Result.TargetTestsVerdict = $targetVerdict
    $Result.P0TestsVerdict = $p0Verdict

    # A summary that cannot be written is a failed run, not a warning: the
    # verdict must never rest on a document nobody could produce.
    try {
    if (-not (Test-Path $Script:ArgusArtifactDir)) {
        New-Item -ItemType Directory -Force -Path $Script:ArgusArtifactDir | Out-Null
    }
    $Result | ConvertTo-Json -Depth 8 | Set-Content -Path (Join-Path $Script:ArgusArtifactDir "full-rehearsal-result.json") -Encoding utf8

    if (Test-Path $Script:ArgusPrivateDocsDir) {
        $reportPath = Join-Path $Script:ArgusPrivateDocsDir "ARGUS_FULL_LOCAL_MIGRATION_REHEARSAL_v1.0.md"
        $status = if ($Result.Success) { "SUCCESS" } else { "FAILED: $($Result.Error)" }
        $phaseTable = if ($Result.RequiredPhaseResults) {
            ($Result.RequiredPhaseResults | ForEach-Object {
                # The failure code a phase WOULD raise is registered up front so
                # the failing path can name itself; showing it on a passing row
                # would read as a failure that did not happen.
                $code = if ($_.Passed) { "" } else { $_.FailureCode }
                "| $($_.Name) | $($_.Required) | $($_.Executed) | $($_.ExitCode) | $($_.Passed) | $($_.Skipped) | $code |"
            }) -join "`n"
        } else { "| (no phase registered a result) | | | | | | |" }
        @"
# ARGUS Full Local Migration Rehearsal v1.0

Generated: $(Get-Date -Format o)
Status: $status

TargetTests=$targetVerdict
P0Tests=$p0Verdict

Blocking-test markers proven this run:
$(if ($Result.BlockingMarkers) { ($Result.BlockingMarkers | ForEach-Object { "- $_" }) -join "`n" } else { "- (none - the run did not reach the blocking-test summary)" })

Audit partition lifecycle markers proven this run:
$(if ($Result.AuditPartitionMarkers) { ($Result.AuditPartitionMarkers | ForEach-Object { "- $_" }) -join "`n" } else { "- (none - the run did not reach the audit partition summary)" })

## Required phase ledger

Success is derived from this table: every Required phase must be Executed,
not Skipped, ExitCode 0 and Passed. A required phase with no row at all is
REHEARSAL_REQUIRED_PHASE_MISSING.

| Phase | Required | Executed | ExitCode | Passed | Skipped | FailureCode |
| --- | --- | --- | --- | --- | --- | --- |
$phaseTable

Cleanup performed: $($Result.CleanupPerformed) (exit $($Result.CleanupExitCode))

Full machine-readable detail: migration-rehearsal-artifacts/full-rehearsal-result.json
(git-excluded, see .git/info/exclude)

See also (same directory, git-excluded):
- migration-rehearsal-artifacts/*.apply.json / *.rollback.json - per-wave detail
- migration-rehearsal-artifacts/test-summary.json - RLS/physical/prisma/repo test detail
- migration-rehearsal-logs/rehearsal.log - full chronological log
- migration-rehearsal-logs/native-commands.log - every native command, its arguments and its real exit code
- migration-rehearsal-logs/psql-output.log - raw psql output per statement file
"@ | Set-Content -Path $reportPath -Encoding utf8
        Write-ArgusLog "Wrote summary to $reportPath"
    }
    } catch {
        Write-ArgusLog "REHEARSAL_SUMMARY_WRITE_FAILED - $($_.Exception.Message)" -Level "ERROR"
        $Result.Success = $false
        $Result.Error = "REHEARSAL_SUMMARY_WRITE_FAILED - $($_.Exception.Message)"
    }

    return $Result
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
