# Attach Product Essentials CentrMark checklist templates into a project.
# Progress lives in <file>.cmk.checks/state.json5 — the .cmk is not rewritten on checkoff.
# Usage:
#   .\attach-product-essentials.ps1 [-Project <path>] [-Classes desktop,web,mobile] [-Force]

param(
    [string]$Project = ".",
    [string]$Classes = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "_checklist-sidecar.ps1")

$templateDir = (Resolve-Path (Join-Path $scriptDir "..\docs\modules\ROOT\examples\product-essentials")).Path
$projectRoot = (Resolve-Path $Project).Path
$destDir = Join-Path $projectRoot ".devcentr\checklists"
New-Item -ItemType Directory -Force -Path $destDir | Out-Null

function Ensure-ChecklistSidecar([string]$cmkPath) {
    if (Resolve-ChecklistStatePath $cmkPath) { return }
    $now = [DateTime]::UtcNow.ToString("o")
    $blueprintId = [IO.Path]::GetFileNameWithoutExtension($cmkPath)
    $out = [ordered]@{
        schemaVersion = 1
        kind          = "centrmark-checklist-progress"
        blueprintId   = $blueprintId
        sourcePath    = $cmkPath
        updatedAt     = $now
        items         = [pscustomobject]@{}
    }
    Write-ChecklistStateJson5 (Get-CanonicalChecklistStatePath $cmkPath) $out
}

$ids = [System.Collections.Generic.List[string]]::new()
[void]$ids.Add("app-essentials")
if ($Classes.Trim().Length -gt 0) {
    foreach ($raw in ($Classes -split ",")) {
        $c = $raw.Trim().ToLowerInvariant()
        if ($c.Length -eq 0) { continue }
        if ($c -notin @("desktop", "web", "mobile")) {
            throw "Unknown class '$c' (use desktop, web, mobile)"
        }
        [void]$ids.Add("auxiliary-$c")
    }
}

$seen = @{}
$ordered = foreach ($id in $ids) {
    if (-not $seen.ContainsKey($id)) {
        $seen[$id] = $true
        $id
    }
}

$copied = @()
$skipped = @()
foreach ($id in $ordered) {
    $src = Join-Path $templateDir "$id.cmk"
    if (-not (Test-Path -LiteralPath $src)) {
        throw "Template missing: $src"
    }
    $dest = Join-Path $destDir "$id.cmk"
    if ((Test-Path -LiteralPath $dest) -and -not $Force) {
        $skipped += $id
        Ensure-ChecklistSidecar $dest
        continue
    }
    Copy-Item -LiteralPath $src -Destination $dest -Force
    Ensure-ChecklistSidecar $dest
    $copied += $id
}

Write-Host "Project: $projectRoot"
Write-Host "Templates: $templateDir"
Write-Host ("Copied: " + ($copied -join ", "))
if ($skipped.Count -gt 0) {
    Write-Host ("Skipped (exists; pass -Force to overwrite .cmk only; sidecars preserved): " + ($skipped -join ", "))
}
Write-Host "Instances: $destDir"
Write-Host "Progress sidecars: <file>.cmk.checks/state.json5"
