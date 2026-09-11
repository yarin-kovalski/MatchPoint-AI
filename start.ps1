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

$LanAddress = $env:MATCHPOINT_LAN_IP

if (-not $LanAddress) {
  $LanCandidates = [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces() |
    Where-Object {
      $_.OperationalStatus -eq [System.Net.NetworkInformation.OperationalStatus]::Up -and
      $_.NetworkInterfaceType -in @(
        [System.Net.NetworkInformation.NetworkInterfaceType]::Ethernet,
        [System.Net.NetworkInformation.NetworkInterfaceType]::Wireless80211
      )
    } |
    ForEach-Object { $_.GetIPProperties().UnicastAddresses } |
    Where-Object {
      $_.Address.AddressFamily -eq [System.Net.Sockets.AddressFamily]::InterNetwork -and
      $_.Address.IPAddressToString -notlike "127.*" -and
      $_.Address.IPAddressToString -notlike "169.254.*"
    } |
    ForEach-Object { $_.Address.IPAddressToString }

  $LanAddress = $LanCandidates |
    Where-Object { $_ -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)' } |
    Select-Object -First 1
  if (-not $LanAddress) {
    $LanAddress = $LanCandidates | Select-Object -First 1
  }
}

if (-not $LanAddress) {
  $LanAddress = ipconfig |
    Select-String 'IPv4 Address[^:]*:\s*(\d+\.\d+\.\d+\.\d+)' |
    ForEach-Object { $_.Matches[0].Groups[1].Value } |
    Where-Object { $_ -notlike "127.*" -and $_ -notlike "169.254.*" } |
    Select-Object -First 1
}

if ($LanAddress) {
  $LanAddress = $LanAddress.Trim()
}
$ParsedLanAddress = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$ParsedLanAddress) -or
    $ParsedLanAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    $LanAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') {
  throw "No private LAN IPv4 address was found. Connect to Wi-Fi or set MATCHPOINT_LAN_IP to this PC's active private IPv4 address."
}

$ServerUrl = "http://${LanAddress}:3000"
$ExpoUrl = "exp://${LanAddress}:8081"

Write-Host ""
Write-Host "MatchPoint AI phone-to-racket demo" -ForegroundColor Green
Write-Host "PC racket: $PcUrl"
Write-Host "Expo server URL: $ServerUrl" -ForegroundColor Yellow
Write-Host "Expo Go LAN URL: $ExpoUrl" -ForegroundColor Yellow
Write-Host "Scan the Expo QR code, then tap Connect and Start in the phone app."
Write-Host "Do not scan a QR code that shows exp://127.0.0.1:8081."
Write-Host "Keep both terminals open. Press Ctrl+C here to stop the project."
Write-Host ""

$BrowserJob = Start-Job -ScriptBlock {
  param($Url)
  Start-Sleep -Seconds 4
  Start-Process $Url
} -ArgumentList $PcUrl

$PreviousExpoServerUrl = $env:EXPO_PUBLIC_SERVER_URL
$PreviousPackagerHostname = $env:REACT_NATIVE_PACKAGER_HOSTNAME
$PreviousPackagerProxyUrl = $env:EXPO_PACKAGER_PROXY_URL
$PreviousExpoOffline = $env:EXPO_OFFLINE
$env:EXPO_PUBLIC_SERVER_URL = $ServerUrl
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanAddress
$env:EXPO_PACKAGER_PROXY_URL = "http://${LanAddress}:8081"
$env:EXPO_OFFLINE = "0"
try {
  $ExpoProcess = Start-Process powershell.exe -PassThru -WorkingDirectory $ExpoDir -ArgumentList @(
    "-NoExit",
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "npx.cmd expo start --lan --go --port 8081 --clear"
  )
}
finally {
  $env:EXPO_PUBLIC_SERVER_URL = $PreviousExpoServerUrl
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $PreviousPackagerHostname
  $env:EXPO_PACKAGER_PROXY_URL = $PreviousPackagerProxyUrl
  $env:EXPO_OFFLINE = $PreviousExpoOffline
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
