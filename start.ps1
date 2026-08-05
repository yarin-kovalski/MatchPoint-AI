$ErrorActionPreference = "Stop"
$RootDir = $PSScriptRoot
$ExpoDir = Join-Path $RootDir "virtucourt-mobile"
$PcUrl = "http://localhost:3000/pc"

Set-Location -LiteralPath $RootDir

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not available in PATH. Install Node.js and reopen the terminal."
}

if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
  Write-Host "Installing project dependencies..." -ForegroundColor Cyan
  npm install
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}

$ExpoNodeModules = Join-Path $ExpoDir "node_modules"
if (-not (Test-Path $ExpoNodeModules)) {
  Write-Host "Installing Expo controller dependencies..." -ForegroundColor Cyan
  Push-Location -LiteralPath $ExpoDir
  try {
    npm install
    if ($LASTEXITCODE -ne 0) {
      exit $LASTEXITCODE
    }
  }
  finally {
    Pop-Location
  }
}

$DefaultRoute = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
  Sort-Object RouteMetric, InterfaceMetric |
  Select-Object -First 1

$LanAddress = if ($DefaultRoute) {
  Get-NetIPAddress -InterfaceIndex $DefaultRoute.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "169.254.*" } |
    Select-Object -ExpandProperty IPAddress -First 1
}

if (-not $LanAddress) {
  $LanAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.IPAddress -notlike "169.254.*" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  Select-Object -ExpandProperty IPAddress -First 1
}

if (-not $LanAddress) {
  throw "No LAN IPv4 address was found. Connect the PC to the same network as the phone."
}

$ServerUrl = "http://${LanAddress}:3000"

Write-Host ""
Write-Host "MatchPoint AI phone-to-racket demo" -ForegroundColor Green
Write-Host "PC racket: $PcUrl"
Write-Host "Expo server URL: $ServerUrl" -ForegroundColor Yellow
Write-Host "Scan the Expo QR code, then tap Connect and Start in the phone app."
Write-Host "Keep both terminals open. Press Ctrl+C here to stop the project."
Write-Host ""

$BrowserJob = Start-Job -ScriptBlock {
  param($Url)
  Start-Sleep -Seconds 4
  Start-Process $Url
} -ArgumentList $PcUrl

$PreviousExpoServerUrl = $env:EXPO_PUBLIC_SERVER_URL
$env:EXPO_PUBLIC_SERVER_URL = $ServerUrl
try {
  $ExpoProcess = Start-Process powershell.exe -PassThru -WorkingDirectory $ExpoDir -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "npx expo start --lan --clear"
  )
}
finally {
  $env:EXPO_PUBLIC_SERVER_URL = $PreviousExpoServerUrl
}

try {
  npm run dev
  exit $LASTEXITCODE
}
finally {
  Stop-Job $BrowserJob -ErrorAction SilentlyContinue
  Remove-Job $BrowserJob -Force -ErrorAction SilentlyContinue
  if (-not $ExpoProcess.HasExited) {
    Stop-Process -Id $ExpoProcess.Id -Force -ErrorAction SilentlyContinue
  }
}
