param(
    [string]$EvidencePath = $env:ARGUS_RLS_AUTO_ENABLE_EVIDENCE_PATH
)

# scripts/database-target/Assert-RlsAutoEnableRemediated.ps1
#
# PowerShell entry point for the rls_auto_enable() cutover guard (drift
# documented in ARGUS_RLS_AUTO_ENABLE_REMEDIATION_v1.0.md). Thin wrapper
# around the Node implementation (Assert-RlsAutoEnableRemediated.mjs /
# lib/rlsAutoEnableGuard.mjs) so CI and local PowerShell callers share one
# source of truth. Never executes the function, never connects to
# production — fails closed without an explicit evidence file.

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$nodeScript = Join-Path $scriptDir "Assert-RlsAutoEnableRemediated.mjs"

$nodeArgs = @($nodeScript)
if ($EvidencePath) {
    $nodeArgs += @("--evidence", $EvidencePath)
}

& node @nodeArgs
exit $LASTEXITCODE
