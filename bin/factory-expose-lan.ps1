param(
  [string]$ListenAddress = "0.0.0.0",
  [int[]]$Ports = @(28589, 4001),
  [switch]$Apply,
  [switch]$ClearOnly
)

$ErrorActionPreference = "Stop"

function Test-Administrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = [Security.Principal.WindowsPrincipal]::new($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-RevelationIp {
  $ip = wsl.exe -d revelation -- bash -lc "hostname -I | awk '{print `$1}'" 2>$null
  $ip = ($ip | Select-Object -First 1).Trim()
  if (-not $ip) {
    throw "Could not resolve Revelation WSL IP. Is `wsl -d revelation` running?"
  }
  return $ip
}

if (-not (Test-Administrator)) {
  throw "Run this from an elevated PowerShell prompt. Netsh portproxy changes require Administrator."
}

$targetIp = Get-RevelationIp

Write-Host "FactoryGrid LAN exposure"
Write-Host "  Revelation IP: $targetIp"
Write-Host "  ListenAddress: $ListenAddress"
Write-Host "  Ports: $($Ports -join ', ')"
Write-Host "  Mode: $(if ($Apply) { if ($ClearOnly) { 'clear' } else { 'apply' } } else { 'dry-run' })"

foreach ($port in $Ports) {
  $delete = "interface portproxy delete v4tov4 listenaddress=$ListenAddress listenport=$port"
  $add = "interface portproxy add v4tov4 listenaddress=$ListenAddress listenport=$port connectaddress=$targetIp connectport=$port"

  if ($Apply) {
    & netsh.exe interface portproxy delete v4tov4 listenaddress=$ListenAddress listenport=$port | Out-Null
    if (-not $ClearOnly) {
      & netsh.exe interface portproxy add v4tov4 listenaddress=$ListenAddress listenport=$port connectaddress=$targetIp connectport=$port | Out-Null
    }
  } else {
    Write-Host "  DRY delete: netsh $delete"
    if (-not $ClearOnly) {
      Write-Host "  DRY add:    netsh $add"
    }
  }
}

Write-Host ""
& netsh.exe interface portproxy show v4tov4
