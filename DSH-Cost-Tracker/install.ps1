# DSH-Cost-Tracker — one-click installer
# Copies the plugin package into the harness home (~/.dsh), adds the loader
# row to the web profile patch, and tells you to restart the harness.
# Idempotent: re-running just re-copies files and leaves the patch untouched
# if the row is already present.
$ErrorActionPreference = "Stop"

$userHome = $env:USERPROFILE
if ([string]::IsNullOrWhiteSpace($userHome)) {
    $userHome = [Environment]::GetFolderPath("UserProfile")
}

# Script location = the DSH-Cost-Tracker package folder
$src = Split-Path -Parent $MyInvocation.MyCommand.Path
$dest = Join-Path $userHome ".dsh\profiles\node_modules\@deepseek-ai\dsh-cost-tracker"
$patch = Join-Path $userHome ".dsh\profiles\web\cordis.patch.yml"

Write-Host "== DSH-Cost-Tracker installer =="

# 1. Create the package dir under the flat module fallback
New-Item -ItemType Directory -Force -Path (Join-Path $dest "lib") | Out-Null

# 2. Copy the three package files
Copy-Item -Force (Join-Path $src "package.json") (Join-Path $dest "package.json")
Copy-Item -Force (Join-Path $src "lib\index.js") (Join-Path $dest "lib\index.js")
Copy-Item -Force (Join-Path $src "lib\client.js") (Join-Path $dest "lib\client.js")
Write-Host "  copied package -> $dest"

# 3. Add the loader row to the web profile patch (only if missing)
$row = @"
- insert:
    - id: cost-tracker
      name: '@deepseek-ai/dsh-cost-tracker'
"@

$content = if (Test-Path $patch) { Get-Content -Raw $patch } else { "" }
if ($content -match "dsh-cost-tracker") {
    Write-Host "  loader row already present; patch untouched"
} else {
    if ($content -match "\[\]\s*$") {
        # patch is still the empty `[]` array -> replace it with the insert block
        $new = $content -replace "\[\]\s*$", $row
    } else {
        # append a new top-level entry
        $new = $content.TrimEnd() + "`n" + $row + "`n"
    }
    Set-Content -Path $patch -Value $new -Encoding UTF8
    Write-Host "  loader row added -> $patch"
}

Write-Host ""
Write-Host "Done. Restart the DeepSeek Harness GUI for the change to take effect."
Write-Host "(new loader rows only load on restart)"
