#!/usr/bin/env nu
# Flip Product Essentials checklist progress in the .cmk.checks sidecar (JSON5; does not rewrite the .cmk).
# Usage:
#   nu checkoff-product-essentials.nu --file .devcentr/checklists/auxiliary-desktop.cmk --id desktop.a.about --marker x

def normalize-marker [m: string] {
  match $m {
    " " | "space" | "unchecked" => " ",
    "x" | "X" | "done" => "x",
    "-" | "blocked" | "na" => "-",
    "/" | "progress" | "wip" => "/",
    _ => (error make {msg: $"Invalid marker '($m)'"})
  }
}

def list-ids [path: string] {
  let text = (open --raw $path)
  $text | parse -r '\{[^}]*\bid\s*=\s*["''](?P<id>[^"'']+)["''][^}]*\}' | get id | uniq
}

def resolve-state-path [cmk: string] {
  let checks_dir = $"($cmk).checks"
  for name in ["state.json5" "state.jsonc" "state.json"] {
    let p = ($checks_dir | path join $name)
    if ($p | path exists) { return $p }
  }
  null
}

def parse-state [path: string] {
  let raw = (open --raw $path)
  let start = ($raw | str index-of "{")
  if $start < 0 {
    error make {msg: $"No JSON object in ($path)"}
  }
  $raw | str substring $start.. | from json
}

def write-state-json5 [path: string, record: record] {
  let checks_dir = ($path | path dirname)
  mkdir $checks_dir
  let body = ($record | to json --indent 2)
  let header = "// Product Essentials checklist progress (JSON5)\n// markers: \" \" | \"/\" | \"x\" | \"-\"\n// Do not store progress in the .cmk or in Scriptbook .cmk.runs/\n\n"
  ($header + $body + "\n") | save --force $path
}

def main [
  --file (-f): path,
  --id (-i): string,
  --marker (-m): string = "x",
  --note (-n): string = ""
] {
  if ($file | is-empty) or ($id | is-empty) {
    error make {msg: "Required: --file and --id"}
  }
  let path = ($file | path expand)
  if not ($path | path exists) {
    error make {msg: $"Missing file: ($path)"}
  }
  let ids = (list-ids $path)
  if $id not-in $ids {
    error make {msg: $"Unknown checklist id '($id)' in ($path)"}
  }
  let m = (normalize-marker $marker)
  let now = (date now | format date "%+")
  let blueprint = ($path | path parse | get stem)
  let canonical = ($"($path).checks" | path join "state.json5")
  let existing_path = (resolve-state-path $path)

  mut items = {}
  mut blueprint_id = $blueprint
  if $existing_path != null {
    let existing = (parse-state $existing_path)
    if ($existing | get -i blueprintId | default null) != null {
      $blueprint_id = ($existing | get blueprintId)
    }
    if ($existing | get -i items | default null) != null {
      $items = ($existing | get items)
    }
  }

  $items = ($items | upsert $id {
    marker: $m
    updatedAt: $now
    note: $note
  })

  write-state-json5 $canonical {
    schemaVersion: 1
    kind: "centrmark-checklist-progress"
    blueprintId: $blueprint_id
    sourcePath: $path
    updatedAt: $now
    items: $items
  }

  print $"Updated ($id) -> [($m)] in ($canonical) (source .cmk unchanged)"
}
