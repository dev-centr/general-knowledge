#!/usr/bin/env nu
# Attach Product Essentials CentrMark checklist templates into a project.
# Progress lives in <file>.cmk.checks/state.json5 — the .cmk is not rewritten on checkoff.

def resolve-state-path [dest: string] {
  let checks_dir = $"($dest).checks"
  for name in ["state.json5" "state.jsonc" "state.json"] {
    let p = ($checks_dir | path join $name)
    if ($p | path exists) { return $p }
  }
  null
}

def write-state-json5 [path: string, record: record] {
  let checks_dir = ($path | path dirname)
  mkdir $checks_dir
  let body = ($record | to json --indent 2)
  let header = "// Product Essentials checklist progress (JSON5)\n// markers: \" \" | \"/\" | \"x\" | \"-\"\n// Do not store progress in the .cmk or in Scriptbook .cmk.runs/\n\n"
  ($header + $body + "\n") | save --force $path
}

def ensure-sidecar [dest: string] {
  if (resolve-state-path $dest) != null { return }
  let now = (date now | format date "%+")
  let blueprint = ($dest | path parse | get stem)
  let canonical = ($"($dest).checks" | path join "state.json5")
  write-state-json5 $canonical {
    schemaVersion: 1
    kind: "centrmark-checklist-progress"
    blueprintId: $blueprint
    sourcePath: $dest
    updatedAt: $now
    items: {}
  }
}

def main [
  --project (-p): path = ".",
  --classes (-c): string = "",
  --force (-f)
] {
  let script_dir = ($env.CURRENT_FILE | path dirname)
  let template_dir = ($script_dir | path join ".." "docs" "modules" "ROOT" "examples" "product-essentials" | path expand)
  if not ($template_dir | path exists) {
    error make {msg: $"Template dir missing: ($template_dir)"}
  }

  let project_root = ($project | path expand)
  let dest_dir = ($project_root | path join ".devcentr" "checklists")
  mkdir $dest_dir

  mut ids = ["app-essentials"]
  let class_list = ($classes | str trim | str downcase)
  if ($class_list | str length) > 0 {
    for c in ($class_list | split row "," | each { |x| $x | str trim } | where { |x| ($x | str length) > 0 }) {
      if $c not-in ["desktop" "web" "mobile"] {
        error make {msg: $"Unknown class '($c)' (use desktop, web, mobile)"}
      }
      $ids = ($ids | append $"auxiliary-($c)")
    }
  }

  mut seen = []
  mut ordered = []
  for id in $ids {
    if $id not-in $seen {
      $seen = ($seen | append $id)
      $ordered = ($ordered | append $id)
    }
  }

  mut copied = []
  mut skipped = []
  for id in $ordered {
    let src = ($template_dir | path join $"($id).cmk")
    if not ($src | path exists) {
      error make {msg: $"Template missing: ($src)"}
    }
    let dest = ($dest_dir | path join $"($id).cmk")
    if ($dest | path exists) and (not $force) {
      $skipped = ($skipped | append $id)
      ensure-sidecar $dest
      continue
    }
    cp -f $src $dest
    ensure-sidecar $dest
    $copied = ($copied | append $id)
  }

  print $"Project: ($project_root)"
  print $"Templates: ($template_dir)"
  print $"Copied: ($copied | str join ', ')"
  if ($skipped | length) > 0 {
    print $"Skipped (exists; --force overwrites .cmk only — sidecars preserved): ($skipped | str join ', ')"
  }
  print $"Instances: ($dest_dir)"
  print "Progress sidecars: <instance>.cmk.checks/state.json5"
}
