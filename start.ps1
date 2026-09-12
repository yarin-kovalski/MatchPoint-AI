$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"
$RootDir = $PSScriptRoot
$ExpoDir = Join-Path $RootDir "virtucourt-mobile"
$MetroPort = 8081
$BackendPort = 3000

function Write-ProcessDiagnostics {
  param(
    [string]$Name,
    [System.Diagnostics.Process]$Process,
    [string]$StdoutPath,
    [string]$StderrPath
  )
  $exitCode = "still running"
  if ($Process) {
    $Process.Refresh()
    if ($Process.HasExited) {
      try { $Process.WaitForExit(); $exitCode = $Process.ExitCode } catch { $exitCode = "unavailable" }
    }
  }
  Write-Host "$Name process exit code: $exitCode" -ForegroundColor Red
  foreach ($log in @(
    @{ Label = "stdout"; Path = $StdoutPath },
    @{ Label = "stderr"; Path = $StderrPath }
  )) {
    Write-Host "$Name $($log.Label) (last 100 lines):" -ForegroundColor Yellow
    if ($log.Path -and (Test-Path -LiteralPath $log.Path)) {
      Get-Content -LiteralPath $log.Path -Tail 100
    } else {
      Write-Host "<no output captured>"
    }
  }
}

function Get-HttpErrorBody {
  param($Exception)
  try {
    $response = $Exception.Response
    if (-not $response) { return $null }
    $reader = New-Object System.IO.StreamReader($response.GetResponseStream())
    try { return $reader.ReadToEnd() } finally { $reader.Dispose() }
  } catch { return $null }
}

function Wait-ForHttp {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 90,
    [System.Diagnostics.Process]$RequiredProcess,
    [string]$ProcessName = "Required",
    [string]$StdoutPath,
    [string]$StderrPath
  )
  $deadline = [DateTime]::UtcNow.AddSeconds($TimeoutSeconds)
  do {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 400) { return $response }
    } catch {
      $statusCode = $null
      if ($_.Exception.Response) { $statusCode = [int]$_.Exception.Response.StatusCode }
      if ($statusCode -ge 400) {
        $body = Get-HttpErrorBody -Exception $_.Exception
        Write-Host "HTTP $statusCode returned by $Url" -ForegroundColor Red
        if ($body) { Write-Host $body }
        Write-ProcessDiagnostics -Name $ProcessName -Process $RequiredProcess -StdoutPath $StdoutPath -StderrPath $StderrPath
        throw "HTTP $statusCode while waiting for $Url"
      }
      if ($RequiredProcess -and $RequiredProcess.HasExited) {
        Write-ProcessDiagnostics -Name $ProcessName -Process $RequiredProcess -StdoutPath $StdoutPath -StderrPath $StderrPath
        throw "$ProcessName exited while waiting for $Url (exit code $($RequiredProcess.ExitCode))"
      }
      Start-Sleep -Milliseconds 500
    }
  } while ([DateTime]::UtcNow -lt $deadline)
  Write-ProcessDiagnostics -Name $ProcessName -Process $RequiredProcess -StdoutPath $StdoutPath -StderrPath $StderrPath
  throw "Timed out waiting for $Url"
}

function Get-ProjectPortOwner {
  param([int]$Port)
  $connection = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $connection) { return $null }
  $process = Get-CimInstance Win32_Process -Filter "ProcessId = $($connection.OwningProcess)" -ErrorAction SilentlyContinue
  [PSCustomObject]@{ Connection = $connection; Process = $process }
}

function Stop-ProcessTree {
  param([int]$ProcessId)
  Get-CimInstance Win32_Process -Filter "ParentProcessId = $ProcessId" -ErrorAction SilentlyContinue |
    ForEach-Object { Stop-ProcessTree -ProcessId $_.ProcessId }
  Stop-Process -Id $ProcessId -Force -ErrorAction SilentlyContinue
}

Set-Location -LiteralPath $RootDir
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  throw "Node.js is not available in PATH. Install Node.js and reopen the terminal."
}
if (-not (Test-Path (Join-Path $RootDir "node_modules"))) {
  Write-Host "Installing project dependencies..." -ForegroundColor Cyan
  npm.cmd install
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
if (-not (Test-Path (Join-Path $ExpoDir "node_modules\expo"))) {
  Write-Host "Installing Expo controller dependencies..." -ForegroundColor Cyan
  npm.cmd install --prefix $ExpoDir
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$DefaultRoutes = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
  Where-Object { $_.State -eq "Alive" } | Sort-Object RouteMetric, InterfaceMetric
$LanCandidates = foreach ($route in $DefaultRoutes) {
  Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue |
    Where-Object {
      $_.AddressState -eq "Preferred" -and $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.IPAddress -match '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)'
    } | ForEach-Object {
      [PSCustomObject]@{ Address = $_.IPAddress; InterfaceAlias = $_.InterfaceAlias; NextHop = $route.NextHop; Metric = $route.RouteMetric + $route.InterfaceMetric }
    }
}
$LanCandidates = @($LanCandidates | Sort-Object Metric -Unique)
Write-Host "LAN candidates:" -ForegroundColor Cyan
$LanCandidates | Format-Table Address, InterfaceAlias, NextHop, Metric -AutoSize

$LanAddress = $env:MATCHPOINT_LAN_IP
if (-not $LanAddress) { $LanAddress = $LanCandidates | Select-Object -First 1 -ExpandProperty Address }
$ParsedLanAddress = $null
if (-not [System.Net.IPAddress]::TryParse($LanAddress, [ref]$ParsedLanAddress) -or
    $ParsedLanAddress.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    $LanAddress -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)') {
  throw "No active private LAN IPv4 was found. Connect to Wi-Fi or set MATCHPOINT_LAN_IP."
}
if ($env:MATCHPOINT_LAN_IP -and $LanAddress -notin $LanCandidates.Address) {
  Write-Warning "MATCHPOINT_LAN_IP=$LanAddress is not on an active default-route adapter."
}

$ExistingMetro = Get-ProjectPortOwner $MetroPort
if ($ExistingMetro) {
  $command = $ExistingMetro.Process.CommandLine
  if ($command -and $command -like "*$ExpoDir*" -and $command -match "expo|metro") {
    Write-Host "Stopping stale project Metro PID $($ExistingMetro.Process.ProcessId)..." -ForegroundColor Yellow
    Stop-Process -Id $ExistingMetro.Process.ProcessId -Force
    Start-Sleep -Milliseconds 500
  } else {
    throw "Port $MetroPort is already in use by PID $($ExistingMetro.Connection.OwningProcess): $command"
  }
}

$ExistingBackend = Get-ProjectPortOwner $BackendPort
if ($ExistingBackend) {
  $command = $ExistingBackend.Process.CommandLine
  if ($command -and $command -match "dist[/\\]server[/\\]index\.js") {
    Write-Host "Stopping stale project backend PID $($ExistingBackend.Process.ProcessId)..." -ForegroundColor Yellow
    Stop-Process -Id $ExistingBackend.Process.ProcessId -Force
    Start-Sleep -Milliseconds 500
  } else {
    throw "Port $BackendPort is already in use by PID $($ExistingBackend.Connection.OwningProcess): $command"
  }
}

$ServerUrl = "http://${LanAddress}:$BackendPort"
$PcUrl = "http://localhost:$BackendPort/pc"
$ExpoUrl = "exp://${LanAddress}:$MetroPort"
$MetroHttpUrl = "http://${LanAddress}:$MetroPort"
$BundleUrl = "${MetroHttpUrl}/index.bundle?platform=ios&dev=true&hot=false"
$ServerLog = Join-Path $env:TEMP "matchpoint-server.log"
$ServerErrorLog = Join-Path $env:TEMP "matchpoint-server-error.log"
$ExpoLog = Join-Path $env:TEMP "matchpoint-expo.log"
$ExpoErrorLog = Join-Path $env:TEMP "matchpoint-expo-error.log"
$ServerProcess = $null
$ExpoProcess = $null
$MetroProcess = $null
$BrowserJob = $null
$PreviousExpoServerUrl = $env:EXPO_PUBLIC_SERVER_URL
$PreviousPackagerHostname = $env:REACT_NATIVE_PACKAGER_HOSTNAME
$PreviousExpoOffline = $env:EXPO_OFFLINE
$env:EXPO_PUBLIC_SERVER_URL = $ServerUrl
$env:REACT_NATIVE_PACKAGER_HOSTNAME = $LanAddress
$env:EXPO_OFFLINE = "0"

try {
  Remove-Item -LiteralPath $ServerLog, $ServerErrorLog, $ExpoLog, $ExpoErrorLog -Force -ErrorAction SilentlyContinue
  Write-Host "Starting backend and PC client build..." -ForegroundColor Cyan
  $ServerProcess = Start-Process npm.cmd -ArgumentList @("run", "dev") -WorkingDirectory $RootDir -PassThru -WindowStyle Hidden -RedirectStandardOutput $ServerLog -RedirectStandardError $ServerErrorLog
  Wait-ForHttp -Url $PcUrl -TimeoutSeconds 120 -RequiredProcess $ServerProcess -ProcessName "Backend" -StdoutPath $ServerLog -StderrPath $ServerErrorLog | Out-Null
  Write-Host "Backend ready: $ServerUrl" -ForegroundColor Green

  Write-Host "Starting Expo from: $ExpoDir" -ForegroundColor Cyan
  Write-Host "Expo command: npx.cmd expo start --lan --go --port $MetroPort --clear"
  $ExpoProcess = Start-Process cmd.exe -PassThru -WindowStyle Hidden -WorkingDirectory $ExpoDir -ArgumentList @(
    "/d", "/s", "/c", "npx.cmd expo start --lan --go --port $MetroPort --clear"
  ) -RedirectStandardOutput $ExpoLog -RedirectStandardError $ExpoErrorLog
  Wait-ForHttp -Url $MetroHttpUrl -TimeoutSeconds 120 -RequiredProcess $ExpoProcess -ProcessName "Expo" -StdoutPath $ExpoLog -StderrPath $ExpoErrorLog | Out-Null
  $listener = Get-NetTCPConnection -State Listen -LocalPort $MetroPort -ErrorAction Stop | Select-Object -First 1
  if ($listener.LocalAddress -eq "127.0.0.1" -or $listener.LocalAddress -eq "::1") {
    throw "Metro is listening only on $($listener.LocalAddress), not the LAN interface."
  }
  $MetroProcess = Get-Process -Id $listener.OwningProcess -ErrorAction Stop
  Write-Host "Metro listening: $($listener.LocalAddress):$MetroPort (PID $($listener.OwningProcess))" -ForegroundColor Green

  Write-Host "Building and fetching the iOS bundle..." -ForegroundColor Cyan
  $bundle = Wait-ForHttp -Url $BundleUrl -TimeoutSeconds 180 -RequiredProcess $MetroProcess -ProcessName "Metro" -StdoutPath $ExpoLog -StderrPath $ExpoErrorLog
  if ($bundle.Content.Length -lt 1000) { throw "Metro returned an unexpectedly small iOS bundle ($($bundle.Content.Length) bytes)." }

  Write-Host ""
  Write-Host "MatchPoint AI is ready" -ForegroundColor Green
  Write-Host "Selected LAN IPv4: $LanAddress"
  Write-Host "PC client: $PcUrl"
  Write-Host "Expo Go LAN URL: $ExpoUrl" -ForegroundColor Yellow
  Write-Host "Verified iOS bundle: $BundleUrl" -ForegroundColor Green
  $QrModule = Join-Path $ExpoDir "node_modules\toqr"
  if (Test-Path -LiteralPath $QrModule) {
    Write-Host "Scan this QR with the iPhone camera:" -ForegroundColor Yellow
    & node -e "const{toQR}=require(process.argv[1]);const q=toQR(process.argv[2]);const n=Math.sqrt(q.length),b=2;for(let y=-b;y<n+b;y++){let s='';for(let x=-b;x<n+b;x++){const white=x<0||y<0||x>=n||y>=n||!q[y*n+x];s+=(white?'\x1b[47m  ':'\x1b[40m  ')}console.log(s+'\x1b[0m')}" $QrModule $ExpoUrl
  }
  Write-Host "The Expo Go address must use $LanAddress."
  Write-Host "Keep both terminals open. Press Ctrl+C here to stop the project."
  $BrowserJob = Start-Job -ScriptBlock { param($Url) Start-Process $Url } -ArgumentList $PcUrl

  while (-not $ServerProcess.HasExited -and -not $MetroProcess.HasExited) { Start-Sleep -Seconds 1 }
  if ($ServerProcess.HasExited) { throw "Backend stopped unexpectedly. See $ServerErrorLog" }
  Write-ProcessDiagnostics -Name "Metro" -Process $MetroProcess -StdoutPath $ExpoLog -StderrPath $ExpoErrorLog
  throw "Metro stopped unexpectedly (exit code $($MetroProcess.ExitCode))."
}
finally {
  $env:EXPO_PUBLIC_SERVER_URL = $PreviousExpoServerUrl
  $env:REACT_NATIVE_PACKAGER_HOSTNAME = $PreviousPackagerHostname
  $env:EXPO_OFFLINE = $PreviousExpoOffline
  if ($BrowserJob) { Stop-Job $BrowserJob -ErrorAction SilentlyContinue; Remove-Job $BrowserJob -Force -ErrorAction SilentlyContinue }
  if ($ExpoProcess -and -not $ExpoProcess.HasExited) { Stop-ProcessTree -ProcessId $ExpoProcess.Id }
  if ($ServerProcess -and -not $ServerProcess.HasExited) { Stop-ProcessTree -ProcessId $ServerProcess.Id }
}
