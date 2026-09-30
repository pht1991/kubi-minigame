# Inject the top nav bar + favicon links into the generated Cocos index.html (gh-pages build).
# Called from deploy-web.bat. Idempotent: skips any block whose marker is already present,
# so re-running the deploy never duplicates links.
$root = $env:KB_ROOT
$tmp  = $env:KB_DEPLOY_TMP
if (-not $root -or -not $tmp) { exit 0 }

$idx = Join-Path $tmp 'index.html'
if (-not (Test-Path $idx)) { exit 0 }

$html = Get-Content $idx -Raw -Encoding UTF8
$changed = $false

# --- top nav bar (marker: kb-topnav) ---
$nav = Join-Path $root 'web-extra\nav.html'
if ((Test-Path $nav) -and $html -notmatch 'kb-topnav') {
  $fragment = Get-Content $nav -Raw -Encoding UTF8
  $html = $html -replace '(?i)</body>', ($fragment + [Environment]::NewLine + '</body>')
  $changed = $true
}

# --- favicon links (marker: kb-favicon) ---
if ($html -notmatch 'kb-favicon') {
  $fav = [Environment]::NewLine + '  <link rel="icon" type="image/svg+xml" href="favicon.svg" data-kb-favicon="1" />' + [Environment]::NewLine + '  <link rel="apple-touch-icon" sizes="180x180" href="apple-touch-icon.png" data-kb-favicon="1" />'
  $html = $html -replace '(?i)</head>', ($fav + [Environment]::NewLine + '</head>')
  $changed = $true
}

if ($changed) { Set-Content $idx $html -Encoding UTF8 }
