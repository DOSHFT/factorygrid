param(
  [string]$Message = "sync factory changes"
)

$ErrorActionPreference = "Stop"
$GitCandidates = @(
  "git.exe",
  "D:\Program Files\Git\cmd\git.exe",
  "C:\Program Files\Git\cmd\git.exe",
  "D:\Program Files\Git\mingw64\bin\git.exe",
  "C:\Program Files\Git\mingw64\bin\git.exe"
)

$Git = $null
foreach ($candidate in $GitCandidates) {
  try {
    $cmd = Get-Command $candidate -ErrorAction Stop
    $Git = $cmd.Source
    break
  } catch {
    if (Test-Path $candidate) {
      $Git = $candidate
      break
    }
  }
}

if (-not $Git) {
  throw "Git for Windows was not found. Install Git or add it to PATH."
}

wsl.exe -d revelation -- bash -lc "cd /home/revelation/factorygrid && bin/factory-secure-backup.sh '$Message'"
& $Git -C "D:\UAT\factorygrid" remote remove origin 2>$null
& $Git -C "D:\UAT\factorygrid" remote add origin "https://github.com/DOSHFT/factorygrid.git"
& $Git -C "D:\UAT\factorygrid" push -u origin main
Write-Host "[BLACKBEAST_PUSH][PASS] D:\UAT\factorygrid -> https://github.com/DOSHFT/factorygrid" -ForegroundColor Green
