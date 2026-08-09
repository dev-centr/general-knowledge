# Shared helpers for Product Essentials checklist sidecars (JSON5 / JSONC / legacy JSON).

function Get-ChecklistStateCandidates([string]$ChecksDir) {
    @(
        (Join-Path $ChecksDir "state.json5"),
        (Join-Path $ChecksDir "state.jsonc"),
        (Join-Path $ChecksDir "state.json")
    )
}

function Resolve-ChecklistStatePath([string]$CmkPath) {
    $checksDir = "$CmkPath.checks"
    foreach ($p in (Get-ChecklistStateCandidates $checksDir)) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return $null
}

function Get-CanonicalChecklistStatePath([string]$CmkPath) {
    Join-Path "$CmkPath.checks" "state.json5"
}

function Strip-Json5Comments([string]$Text) {
    $sb = New-Object System.Text.StringBuilder
    $inStr = $false
    $quote = [char]'"'
    for ($i = 0; $i -lt $Text.Length; $i++) {
        $c = $Text[$i]
        if ($inStr) {
            [void]$sb.Append($c)
            if ($c -eq '\' -and ($i + 1) -lt $Text.Length) {
                [void]$sb.Append($Text[$i + 1])
                $i++
                continue
            }
            if ($c -eq $quote) { $inStr = $false }
            continue
        }
        if ($c -eq '"' -or $c -eq "'") {
            $inStr = $true
            $quote = $c
            [void]$sb.Append($c)
            continue
        }
        if ($c -eq '/' -and ($i + 1) -lt $Text.Length -and $Text[$i + 1] -eq '/') {
            $i += 2
            while ($i -lt $Text.Length -and $Text[$i] -ne "`n") { $i++ }
            continue
        }
        if ($c -eq '/' -and ($i + 1) -lt $Text.Length -and $Text[$i + 1] -eq '*') {
            $i += 2
            while (($i + 1) -lt $Text.Length -and -not ($Text[$i] -eq '*' -and $Text[$i + 1] -eq '/')) { $i++ }
            if (($i + 1) -lt $Text.Length) { $i += 2 }
            continue
        }
        [void]$sb.Append($c)
    }
    $s = $sb.ToString()
    return [regex]::Replace($s, ',(\s*[}\]])', '$1')
}

function ConvertFrom-Json5Text([string]$Text) {
    (Strip-Json5Comments $Text) | ConvertFrom-Json
}

function Write-ChecklistStateJson5([string]$Path, $Object) {
    $dir = Split-Path -Parent $Path
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $json = ($Object | ConvertTo-Json -Depth 8)
    # trailing commas before closing braces/brackets (JSON5); never after bare { or [
    $json = [regex]::Replace($json, '([^\s,{\[])(\r?\n\s*[}\]])', '$1,$2')
    $header = @"
// Product Essentials checklist progress (JSON5)
// Docs: https://docs.devcentr.org/general-knowledge/latest/reference/checklist-sidecar.html
// markers: " " | "/" | "x" | "-"  (note on "-" for N/A)
// Do not store progress in the .cmk or in Scriptbook .cmk.runs/

"@
    $utf8 = New-Object System.Text.UTF8Encoding $false
    [IO.File]::WriteAllText($Path, $header + $json + "`n", $utf8)
}
