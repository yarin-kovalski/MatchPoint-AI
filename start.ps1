$RootDir = $PSScriptRoot
$MobileDir = Join-Path $RootDir "virtucourt-mobile"
$NodePath = "C:\Program Files\nodejs"

$ServerCommand = @"
`$env:Path = "$NodePath;`$env:Path"
Set-Location -LiteralPath "$RootDir"
npm run dev
"@

$ExpoCommand = @"
`$env:Path = "$NodePath;`$env:Path"
Set-Location -LiteralPath "$MobileDir"
npx expo start --lan --clear
"@

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $ServerCommand
)

Start-Sleep -Seconds 1

Start-Process powershell.exe -ArgumentList @(
  "-NoExit",
  "-ExecutionPolicy",
  "Bypass",
  "-Command",
  $ExpoCommand
)
