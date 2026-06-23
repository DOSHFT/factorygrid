param(
  [string]$Message = "sync factory source of truth",
  [string]$UatRoot = "D:\UAT\factorygrid",
  [string]$GitHubRemote = "https://github.com/DOSHFT/factorygrid.git",
  [string]$Branch = "main",
  [string]$WslDistro = "revelation",
  [string]$LiveRoot = "/home/revelation/factorygrid",
  [string]$BackupRoot = "D:\UAT\factorygrid_backups",
  [switch]$Apply,
  [switch]$SkipLiveReset,
  [switch]$FixLiveOwnership
)

$ErrorActionPreference = "Stop"

function Find-Git {
  $candidates = @(
    "git.exe",
    "D:\Program Files\Git\cmd\git.exe",
    "C:\Program Files\Git\cmd\git.exe",
    "D:\Program Files\Git\mingw64\bin\git.exe",
    "C:\Program Files\Git\mingw64\bin\git.exe"
  )
  foreach ($candidate in $candidates) {
    try {
      return (Get-Command $candidate -ErrorAction Stop).Source
    } catch {
      if (Test-Path $candidate) { return $candidate }
    }
  }
  throw "Git for Windows was not found."
}

function Run-Git {
  param([string[]]$GitArgs, [string]$Cwd = $UatRoot)
  & $Git -C $Cwd @GitArgs
  if ($LASTEXITCODE -ne 0) {
    throw "git $($GitArgs -join ' ') failed in $Cwd"
  }
}

function Run-Wsl {
  param([string]$Script, [switch]$Root)
  $tempName = ".factory-sot-$PID-$([Guid]::NewGuid().ToString('N')).sh"
  $tempPath = Join-Path $UatRoot $tempName
  [System.IO.File]::WriteAllText($tempPath, $Script, (New-Object System.Text.UTF8Encoding($false)))
  $wslTempPath = "/mnt/d/UAT/factorygrid/$tempName"
  $args = @("-d", $WslDistro)
  if ($Root) { $args += @("-u", "root") }
  $args += @("--", "bash", $wslTempPath)
  try {
    & wsl.exe @args
    if ($LASTEXITCODE -ne 0) {
      throw "WSL command failed: $Script"
    }
  } finally {
    Remove-Item -LiteralPath $tempPath -Force -ErrorAction SilentlyContinue
  }
}

function Backup-Uat {
  param([string]$Dir)
  New-Item -ItemType Directory -Force $Dir | Out-Null
  Run-Git @("diff") | Set-Content -Path (Join-Path $Dir "tracked.diff") -Encoding utf8
  Run-Git @("status", "--short") | Set-Content -Path (Join-Path $Dir "status.txt") -Encoding utf8
  Run-Git @("rev-parse", "HEAD") | Set-Content -Path (Join-Path $Dir "head.txt") -Encoding utf8
  $untrackedFiles = @(Run-Git @("ls-files", "--others", "--exclude-standard") | Where-Object { $_ })
  $untrackedFiles | Set-Content -Path (Join-Path $Dir "untracked-files.txt") -Encoding utf8
  if ($untrackedFiles.Count -gt 0) {
    $copyRoot = Join-Path $Dir "untracked-files"
    foreach ($rel in $untrackedFiles) {
      $src = Join-Path $UatRoot $rel
      if (-not (Test-Path -LiteralPath $src)) { continue }
      $dest = Join-Path $copyRoot $rel
      New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
      Copy-Item -LiteralPath $src -Destination $dest -Recurse -Force
    }
  }
}

function Backup-Live {
  param([string]$Stamp)
  $script = @"
set -euo pipefail
cd '$LiveRoot'
backup_dir='/home/revelation/factorygrid_backups/source-of-truth-sync-$Stamp'
mkdir -p "`$backup_dir"
git diff > "`$backup_dir/tracked.diff" || true
git status --short > "`$backup_dir/status.txt" || true
git rev-parse HEAD > "`$backup_dir/head.txt" || true
git ls-files --others --exclude-standard | sed '/^`$/d' > "`$backup_dir/untracked-files.txt" || true
if [ -s "`$backup_dir/untracked-files.txt" ]; then
  tar -czf "`$backup_dir/untracked-files.tar.gz" -T "`$backup_dir/untracked-files.txt" 2> "`$backup_dir/untracked-tar-warnings.txt" || true
fi
printf '%s\n' "`$backup_dir"
"@
  Run-Wsl $script
}

function Assert-NoSecretPathsStaged {
  $staged = & $Git -C $UatRoot diff --cached --name-only
  if ($LASTEXITCODE -ne 0) { throw "Unable to inspect staged files." }
  $blocked = $staged | Where-Object {
    $_ -match '(^|/)\.env($|[.])' -or
    $_ -match '(^|/)(openhands_state|qdrant_storage|node_modules|logs|\.git)(/|$)' -or
    $_ -match '(secret|credential|credentials|\.pem$|\.key$|\.pfx$|\.p12$|\.token$|\.jwt$)'
  }
  if ($blocked) {
    throw "Refusing to commit secret/runtime paths: $($blocked -join ', ')"
  }
}

if (-not (Test-Path $UatRoot)) { throw "UAT root not found: $UatRoot" }
$Git = Find-Git
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupRoot "source-of-truth-sync-$stamp"

Write-Host "[SOT] Source of truth: GitHub $GitHubRemote $Branch"
Write-Host "[SOT] UAT commit workspace: $UatRoot"
Write-Host "[SOT] Live deploy target: ${WslDistro}:$LiveRoot"
Write-Host "[SOT] Mode: $(if ($Apply) { 'APPLY' } else { 'DRY-RUN' })"

Backup-Uat (Join-Path $backupDir "uat")
Backup-Live $stamp

Run-Git @("remote", "remove", "origin") 2>$null
Run-Git @("remote", "add", "origin", $GitHubRemote)
Run-Git @("fetch", "origin", $Branch)

$uatStatus = & $Git -C $UatRoot status --porcelain=v1
if ($uatStatus) {
  Write-Host "[SOT] UAT has changes:"
  $uatStatus | ForEach-Object { Write-Host "  $_" }
  if (-not $Apply) {
    Write-Host "[SOT][DRY-RUN] Would git add -A, commit, and push UAT changes."
  } else {
    Run-Git @("add", "-A")
    Assert-NoSecretPathsStaged
    $staged = & $Git -C $UatRoot diff --cached --name-only
    if ($staged) {
      Run-Git @("commit", "-m", $Message)
    }
  }
} else {
  Write-Host "[SOT] UAT is clean."
}

if ($Apply) {
  Run-Git @("branch", "-M", $Branch)
  Run-Git @("push", "-u", "origin", $Branch)
} else {
  Write-Host "[SOT][DRY-RUN] Would push UAT $Branch to GitHub."
}

$targetHead = (& $Git -C $UatRoot rev-parse "HEAD").Trim()
if (-not $targetHead) { throw "Unable to resolve UAT HEAD." }
Write-Host "[SOT] Target commit: $targetHead"

if ($SkipLiveReset) {
  Write-Host "[SOT] Skipping live Revelation reset by request."
} elseif ($Apply) {
  $ownershipPrefix = ""
  if ($FixLiveOwnership) {
    $ownershipPrefix = "chown -R revelation:revelation '$LiveRoot/rufloui' '$LiveRoot/workspace' 2>/dev/null || true; "
  }
  $liveScript = @"
set -euo pipefail
$ownershipPrefix
cd '$LiveRoot'
git remote remove github 2>/dev/null || true
git remote add github '$GitHubRemote'
git fetch github '$Branch'
git reset --hard '$targetHead'
git status --porcelain=v1
"@
  $liveOutput = if ($FixLiveOwnership) { Run-Wsl $liveScript -Root } else { Run-Wsl $liveScript }
  if ($liveOutput) {
    throw "Live Revelation still has drift after reset: $liveOutput"
  }
  Write-Host "[SOT] Live Revelation reset to $targetHead and is clean."
} else {
  Write-Host "[SOT][DRY-RUN] Would fetch GitHub and reset live Revelation to $targetHead after backup."
}

$finalUatStatus = & $Git -C $UatRoot status --porcelain=v1
if ($finalUatStatus) {
  Write-Host "[SOT][WARN] UAT still has changes:"
  $finalUatStatus | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host "[SOT] UAT clean."
}

Write-Host "[SOT] Backups: $backupDir and /home/revelation/factorygrid_backups/source-of-truth-sync-$stamp"
Write-Host "[SOT][PASS] Source-of-truth sync check complete."
