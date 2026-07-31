#!/usr/bin/env nu
# check-gh-pages-https.nu — Detect Cloudflare proxy vs GitHub Pages DNS,
# poll Pages API certificate state, optionally enable Enforce HTTPS.
#
# Requires: nu, gh (authenticated), dig or Resolve-DnsName / getent as available.
#
# Usage:
#   nu scripts/check-gh-pages-https.nu --repo owner/docs --host docs.example.org
#   nu scripts/check-gh-pages-https.nu --repo owner/docs --host docs.example.org --enable-https
#   nu scripts/check-gh-pages-https.nu --repo owner/docs --host docs.example.org --timeout-secs 600 --poll-secs 15

def is-github-pages-ip [ip: string] {
  ($ip | str starts-with "185.199.") or ($ip | str starts-with "2606:50c0:")
}

def is-cloudflare-ip [ip: string] {
  ($ip | str starts-with "104.21.") or ($ip | str starts-with "172.67.") or ($ip | str starts-with "2606:4700:")
}

def resolve-host [host: string] {
  # Prefer dig when present (cross-platform via scoop/brew/apt).
  if (which dig | is-not-empty) {
    let a = (do { ^dig +short A $host } | complete)
    let aaaa = (do { ^dig +short AAAA $host } | complete)
    let cname = (do { ^dig +short CNAME $host } | complete)
    let ips = (
      ([$a.stdout $aaaa.stdout] | str join "\n" | lines | where {|l| ($l | str trim | is-not-empty)} | uniq)
    )
    let cnames = (
      $cname.stdout | lines | where {|l| ($l | str trim | is-not-empty)} | each {|l| $l | str trim | str trim --right "."}
    )
    return { ips: $ips, cnames: $cnames }
  }

  # Fallback: nslookup (Windows/Unix)
  let out = (do { ^nslookup $host } | complete)
  let text = $"($out.stdout)\n($out.stderr)"
  let ips = (
    $text
    | lines
    | where {|l| ($l | str contains "Address") and (not ($l | str contains "#"))}
    | each {|l|
      $l
      | str replace -a "Addresses:" ""
      | str replace -a "Address:" ""
      | str trim
    }
    | where {|l| ($l | is-not-empty) and (($l | str contains ".") or ($l | str contains ":"))}
    | uniq
  )
  { ips: $ips, cnames: [] }
}

def classify-dns [resolved: record] {
  mut github = 0
  mut cloudflare = 0
  mut other = 0
  for ip in $resolved.ips {
    if (is-github-pages-ip $ip) {
      $github = $github + 1
    } else if (is-cloudflare-ip $ip) {
      $cloudflare = $cloudflare + 1
    } else {
      $other = $other + 1
    }
  }
  let proxied = $cloudflare > 0 and $github == 0
  let points_at_github = $github > 0
  {
    proxied: $proxied,
    points_at_github: $points_at_github,
    github_ip_count: $github,
    cloudflare_ip_count: $cloudflare,
    other_ip_count: $other,
    ips: $resolved.ips,
    cnames: $resolved.cnames,
  }
}

def pages-status [repo: string] {
  let raw = (^gh api $"repos/($repo)/pages" | from json)
  let cert = ($raw.https_certificate? | default null)
  {
    cname: ($raw.cname? | default null),
    https_enforced: ($raw.https_enforced? | default false),
    html_url: ($raw.html_url? | default null),
    cert_state: (if $cert == null { null } else { $cert.state? | default null }),
    cert_description: (if $cert == null { null } else { $cert.description? | default null }),
    cert_expires_at: (if $cert == null { null } else { $cert.expires_at? | default null }),
    raw: $raw,
  }
}

def enable-https [repo: string] {
  '{"https_enforced":true}' | ^gh api -X PUT $"repos/($repo)/pages" --input - | from json
}

def main [
  --repo: string,           # owner/name
  --host: string,           # custom domain hostname
  --enable-https,           # PUT https_enforced=true when cert approved
  --timeout-secs: int = 300,
  --poll-secs: int = 10,
  --once,                   # check once, do not poll
] {
  if ($repo == null) or ($repo | is-empty) or ($host == null) or ($host | is-empty) {
    print "Usage: nu scripts/check-gh-pages-https.nu --repo owner/name --host docs.example.org [--enable-https] [--timeout-secs 300] [--poll-secs 10] [--once]"
    exit 2
  }

  print $"== DNS ($host) =="
  let resolved = (resolve-host $host)
  let dns = (classify-dns $resolved)
  print ($dns | reject ips | insert ips ($dns.ips | str join ", "))

  if $dns.proxied {
    print ""
    print "NEXT ACTION: Cloudflare orange-cloud (proxy) is ON."
    print "  Set this hostname to DNS only (grey cloud) so GitHub can issue Let's Encrypt."
    print "  Re-check with this script after DNS propagates."
    print "  (Cloudflare API auto grey-cloud is a follow-on; not done by this script.)"
    exit 3
  }

  if not $dns.points_at_github {
    print ""
    print "NEXT ACTION: Hostname does not resolve to known GitHub Pages IPs."
    print "  Expected CNAME to <owner>.github.io or A/AAAA to 185.199.x / 2606:50c0:…"
    print $"  Saw IPs: ($dns.ips | str join ', ')"
    exit 4
  }

  print ""
  print $"== Pages API ($repo) =="

  mut deadline = ((date now) + ($timeout_secs * 1sec))
  mut status = (pages-status $repo)

  loop {
    print $"cname=($status.cname) cert_state=($status.cert_state) https_enforced=($status.https_enforced) html_url=($status.html_url)"
    if $status.cert_description != null {
      print $"  ($status.cert_description)"
    }

    if $status.cert_state == "approved" {
      break
    }

    if $once {
      print ""
      print "NEXT ACTION: Certificate not approved yet. Wait and re-run (issuance is automatic; no request button)."
      exit 5
    }

    if (date now) > $deadline {
      print ""
      print $"NEXT ACTION: Timed out after ($timeout_secs)s waiting for cert approval. DNS looks fine — keep waiting / re-run."
      exit 6
    }

    print $"  waiting ($poll_secs)s…"
    sleep ($poll_secs * 1sec)
    $status = (pages-status $repo)
  }

  print ""
  print "Certificate approved."

  if $enable_https {
    if $status.https_enforced {
      print "Enforce HTTPS already on."
    } else {
      print "Enabling Enforce HTTPS…"
      let updated = (enable-https $repo)
      print $"https_enforced=($updated.https_enforced? | default true) html_url=($updated.html_url? | default '')"
    }
  } else if not $status.https_enforced {
    print "NEXT ACTION: Enable Enforce HTTPS in Pages settings, or re-run with --enable-https."
  } else {
    print "Enforce HTTPS is on. Done."
  }

  exit 0
}
