# Print woven Product Essentials checklist status (sidecar overlays .cmk defaults).
# Usage:
#   .\status-product-essentials.ps1 -File .devcentr\checklists\auxiliary-desktop.cmk

param(
    [Parameter(Mandatory = $true)][string]$File
)

$ErrorActionPreference = "Stop"
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
. (Join-Path $scriptDir "_checklist-sidecar.ps1")

$path = (Resolve-Path $File).Path
$statePath = Resolve-ChecklistStatePath $path

$items = @{}
if ($statePath) {
    $state = ConvertFrom-Json5Text (Get-Content -LiteralPath $statePath -Raw)
    if ($state.items) {
        foreach ($p in $state.items.PSObject.Properties) {
            $items[$p.Name] = $p.Value
        }
    }
}

Write-Host "Source: $path"
Write-Host ("Sidecar: " + $(if ($statePath) { $statePath } else { "(none yet)" }))
Write-Host ("{0,-8} {1,-36} {2}" -f "MARK", "ID", "LABEL / NOTE")
Write-Host ("-" * 80)

foreach ($line in Get-Content -LiteralPath $path) {
    $m = [regex]::Match($line, '^\s*\[([^\]])\]\s+(.+?)\s*\{[^}]*\bid\s*=\s*["'']([^"'']+)["'']')
    if (-not $m.Success) { continue }
    $docMark = $m.Groups[1].Value
    $label = $m.Groups[2].Value.Trim()
    $id = $m.Groups[3].Value
    $eff = $docMark
    $note = ""
    if ($items.ContainsKey($id)) {
        $eff = $items[$id].marker
        if ($items[$id].note) { $note = $items[$id].note }
    }
    $suffix = if ($note) { "  ($note)" } else { "" }
    Write-Host ("[{0}]      {1,-36} {2}{3}" -f $eff, $id, $label, $suffix)
}
