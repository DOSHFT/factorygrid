[CmdletBinding()]
param(
  [switch]$Admin,
  [switch]$Quiet
)

$ErrorActionPreference = 'Stop'

$MarkRoot = if ($env:MARK_XLVII_ROOT) { $env:MARK_XLVII_ROOT } else { 'D:\Dev\Repos\Mark-XLVII' }
$DisabledMarker = 'D:\UAT\factorygrid\runtime\jarvis-startup.disabled'
if (Test-Path $DisabledMarker) {
  exit 0
}
$Python = Join-Path $MarkRoot '.venv\Scripts\python.exe'
$Main = Join-Path $MarkRoot 'main.py'
$Config = Join-Path $MarkRoot 'config\api_keys.json'
$LogDir = Join-Path $MarkRoot 'logs'
$Stdout = Join-Path $LogDir 'mark-xlvii.out.log'
$Stderr = Join-Path $LogDir 'mark-xlvii.err.log'
$PidFile = Join-Path $LogDir 'mark-xlvii.pid'
$FactoryRoot = if ($env:FACTORYGRID_ROOT) { $env:FACTORYGRID_ROOT } else { 'D:\UAT\factorygrid' }
$FactoryBrain = Join-Path $FactoryRoot 'workspace\factory-brain'
$SpecKit = Join-Path $FactoryRoot 'workspace\spec-kit'
$ObsidianVault = if ($env:FACTORYGRID_OBSIDIAN_VAULT) { $env:FACTORYGRID_OBSIDIAN_VAULT } else { 'D:\Knowledge\Kartpathy-Wiki' }
$ModelSelfHeal = Join-Path $FactoryRoot 'bin\jarvis-model-self-heal.ps1'

if (!(Test-Path $Python)) {
  throw "Mark XLVII venv is missing: $Python. Run install from $MarkRoot first."
}
if (!(Test-Path $Main)) {
  throw "Mark XLVII main.py is missing: $Main"
}
if (!(Test-Path $Config)) {
  Write-Warning "Missing $Config. Jarvis dashboard can install, but Gemini Live will not connect until gemini_api_key is configured."
}

New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

if (Test-Path $PidFile) {
  $recordedPid = (Get-Content -LiteralPath $PidFile -ErrorAction SilentlyContinue | Select-Object -First 1)
  if ($recordedPid -match '^\d+$') {
    $recordedProc = Get-CimInstance Win32_Process -Filter "ProcessId=$recordedPid" -ErrorAction SilentlyContinue
    if ($recordedProc -and ($recordedProc.ExecutablePath -eq $Python) -and ([string]$recordedProc.CommandLine).Contains('main.py')) {
      if (!$Quiet) { Write-Host "Mark XLVII already running from pid file. PID: $recordedPid" }
      exit 0
    }
  }
}

$escapedPython = [Regex]::Escape($Python)
$stale = Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  $exe = $_.ExecutablePath
  ($_.Name -like 'python*.exe') -and
  ($cmd -match '(^|[\\/\s"])main\.py([\\/\s"]|$)') -and
  ($exe -ne $Python)
}
foreach ($proc in $stale) {
  Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

$existing = Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  $exe = $_.ExecutablePath
  ($_.Name -like 'python*.exe') -and
  (($exe -eq $Python) -or ($cmd -match $escapedPython)) -and
  ($cmd -match '(^|[\\/\s"])main\.py([\\/\s"]|$)')
}
if ($existing) {
  $pids = ($existing | Select-Object -ExpandProperty ProcessId) -join ', '
  ($existing | Select-Object -First 1 -ExpandProperty ProcessId) | Set-Content -LiteralPath $PidFile -Encoding ASCII
  Write-Host "Mark XLVII already appears to be running. PIDs: $pids"
  exit 0
}

$arguments = @('-X', 'utf8', '-W', 'ignore', '-u', 'main.py')
$env:PYTHONWARNINGS = 'ignore'
$env:PYTHONUTF8 = '1'
$env:PYTHONIOENCODING = 'utf-8'
$env:QT_LOGGING_RULES = 'qt.qpa.window=false'
$env:FACTORYGRID_ROOT = $FactoryRoot
$env:FACTORYGRID_FACTORY_BRAIN = $FactoryBrain
$env:FACTORYGRID_SPEC_KIT = $SpecKit
$env:FACTORYGRID_OBSIDIAN_VAULT = $ObsidianVault
$env:FACTORYGRID_MODEL_SELF_HEAL = $ModelSelfHeal
$startArgs = @{
  FilePath = $Python
  ArgumentList = $arguments
  WorkingDirectory = $MarkRoot
  RedirectStandardOutput = $Stdout
  RedirectStandardError = $Stderr
  WindowStyle = 'Hidden'
}

if ($Admin) {
  Write-Warning "The Jarvis autostart launcher runs hidden without UAC prompts. Start an elevated shell manually for admin-only tasks."
}

$proc = Start-Process @startArgs -PassThru
if ($proc -and $proc.Id) {
  $proc.Id | Set-Content -LiteralPath $PidFile -Encoding ASCII
}
Start-Sleep -Milliseconds 750
$started = Get-CimInstance Win32_Process | Where-Object {
  $cmd = $_.CommandLine
  $exe = $_.ExecutablePath
  ($exe -eq $Python) -and ($cmd -match '(^|[\\/\s"])main\.py([\\/\s"]|$)')
} | Sort-Object ProcessId -Descending | Select-Object -First 1
if ($started) {
  $started.ProcessId | Set-Content -LiteralPath $PidFile -Encoding ASCII
}
if (!$Quiet) {
  Write-Host "Started Mark XLVII Jarvis from $MarkRoot"
}
if (!$Admin -and !$Quiet) {
  Write-Host "Logs: $Stdout and $Stderr"
}
if ($Admin -and !$Quiet) {
  Write-Host "Requested elevated Windows token for Jarvis. Accept the UAC prompt on BlackBeast."
}
