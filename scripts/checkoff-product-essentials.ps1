# Flip Product Essentials checklist progress in the .cmk.checks sidecar (JSON5; does not rewrite the .cmk).
# Usage:
#   .\checkoff-product-essentials.ps1 -File .devcentr\checklists\auxiliary-desktop.cmk -Id desktop.a.about -Marker x
#   .\checkoff-product-essentials.ps1 -File ... -Id desktop.b.tray -Marker - -Note "N/A — no tray"

param(
    [Parameter(Mandatory = $true)][string]$File,
    [Parameter(Mandatory = $true)][string]$Id,
    [ValidateSet(" ", "x", "X", "-", "/")]
    [string]$Marker = "x",
    [string]$Note = ""
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "_checklist-sidecar.ps1")

function Normalize-Marker([string]$m) {
    if ($m -eq "X") { return "x" }
    return $m
}

function Get-ChecklistIds([string]$cmkPath) {
    $text = Get-Content -LiteralPath $cmkPath -Raw
    $ids = [System.Collections.Generic.List[string]]::new()
    foreach ($m in [regex]::Matches($text, '\{[^}]*\bid\s*=\s*["'']([^"'']+)["''][^}]*\}')) {
        $id = $m.Groups[1].Value
        if (-not $ids.Contains($id)) { [void]$ids.Add($id) }
    }
    return $ids
}

$path = (Resolve-Path $File).Path
if (-not (Test-Path -LiteralPath $path)) { throw "Missing file: $path" }

$ids = Get-ChecklistIds $path
if (-not $ids.Contains($Id)) { throw "Unknown checklist id '$Id' in $path" }

$marker = Normalize-Marker $Marker
$now = [DateTime]::UtcNow.ToString("o")
$blueprintId = [IO.Path]::GetFileNameWithoutExtension($path)
$canonical = Get-CanonicalChecklistStatePath $path
$existing = Resolve-ChecklistStatePath $path

if ($existing) {
    $state = ConvertFrom-Json5Text (Get-Content -LiteralPath $existing -Raw)
} else {
    $state = [pscustomobject]@{
        schemaVersion = 1
        kind          = "centrmark-checklist-progress"
        blueprintId   = $blueprintId
        sourcePath    = $path
        updatedAt     = $now
        items         = [pscustomobject]@{}
    }
}

if (-not $state.items) { $state | Add-Member -NotePropertyName items -NotePropertyValue ([pscustomobject]@{}) -Force }

$item = [pscustomobject]@{
    marker    = $marker
    updatedAt = $now
    note      = $Note
}
$itemsHash = @{}
foreach ($p in $state.items.PSObject.Properties) {
    $itemsHash[$p.Name] = $p.Value
}
$itemsHash[$Id] = $item

$outItems = [ordered]@{}
foreach ($k in ($itemsHash.Keys | Sort-Object)) {
    $outItems[$k] = $itemsHash[$k]
}

$out = [ordered]@{
    schemaVersion = 1
    kind          = "centrmark-checklist-progress"
    blueprintId   = $(if ($state.blueprintId) { $state.blueprintId } else { $blueprintId })
    sourcePath    = $path
    updatedAt     = $now
    items         = [pscustomobject]$outItems
}

Write-ChecklistStateJson5 $canonical $out
Write-Host "Updated $Id -> [$marker] in $canonical (source .cmk unchanged)"
