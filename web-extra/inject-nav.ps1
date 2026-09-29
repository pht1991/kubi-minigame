# Inject the top nav bar into the generated Cocos index.html (gh-pages build).
# Called from deploy-web.bat. Idempotent: skips if already injected (kb-topnav marker).
$root = $env:KB_ROOT
$tmp  = $env:KB_DEPLOY_TMP
if (-not $root -or -not $tmp) { exit 0 }

$idx = Join-Path $tmp 'index.html'
$nav = Join-Path $root 'web-extra\nav.html'
if (-not (Test-Path $idx)) { exit 0 }
if (-not (Test-Path $nav)) { exit 0 }

$html = Get-Content $idx -Raw -Encoding UTF8
if ($html -and $html -notmatch 'kb-topnav') {
  $fragment = Get-Content $nav -Raw -Encoding UTF8
  $html = $html -replace '(?i)</body>', ($fragment + [Environment]::NewLine + '</body>')
  Set-Content $idx $html -Encoding UTF8
}
