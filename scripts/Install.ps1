$ErrorActionPreference = 'Stop'
$target = 'D:\Projects\FloatInbox'
$source = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$version = '45.5.0'
try {
  if (-not (Test-Path 'D:\')) { throw 'D: drive is not available. No files were installed.' }
  $same = $source.TrimEnd('\') -ieq $target.TrimEnd('\')
  if (-not $same) {
    if (Test-Path $target) {
      $installed = Join-Path $target 'package.json'
      if (-not (Test-Path $installed) -or ((Get-Content -Raw $installed | ConvertFrom-Json).name -ne 'float-inbox')) {
        throw "Existing folder $target is not this project. No files were overwritten."
      }
      Write-Host "Reusing the existing project at $target. Source and data are preserved."
    } else {
      $parent = Split-Path $target
      New-Item -ItemType Directory -Force -Path $parent | Out-Null
      $stage = Join-Path $parent ('FloatInbox-install-' + [guid]::NewGuid().ToString('N'))
      New-Item -ItemType Directory -Path $stage | Out-Null
      try {
        foreach ($part in @('app','test','scripts','package.json','Start.cmd','Setup-D.cmd','README.md')) {
          Copy-Item -LiteralPath (Join-Path $source $part) -Destination $stage -Recurse
        }
        [IO.Directory]::Move($stage,$target)
      } finally { if (Test-Path $stage) { Remove-Item -Recurse -Force $stage } }
    }
  }
  $exe = Join-Path $target 'runtime\electron.exe'
  if (-not (Test-Path $exe)) {
    $cpu = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {'arm64'} else {'x64'}
    if (-not [Environment]::Is64BitOperatingSystem) { throw 'Windows 10/11 x64 or ARM64 is required.' }
    $asset = "electron-v$version-win32-$cpu.zip"
    $base = "https://github.com/electron/electron/releases/download/v$version"
    $temp = Join-Path $target ('.setup-' + [guid]::NewGuid().ToString('N'))
    New-Item -Type Directory -Path $temp | Out-Null
    try {
      [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
      $ProgressPreference = 'SilentlyContinue'
      # The official release checksum list also verifies a manually supplied archive.
      $localZip = Join-Path $source $asset
      $localHashes = Join-Path $source 'SHASUMS256.txt'
      $hashes = Join-Path $temp 'checksums.txt'
      if (Test-Path $localHashes) { Copy-Item $localHashes $hashes } else { Invoke-WebRequest -UseBasicParsing "$base/SHASUMS256.txt" -OutFile $hashes }
      $entry = Get-Content $hashes | Where-Object { $_ -match ('^[a-fA-F0-9]{64}\s+\*?' + [regex]::Escape($asset) + '$') } | Select-Object -First 1
      if (-not $entry) { throw "No official checksum found for $asset" }
      $zip = Join-Path $temp 'runtime.zip'
      if (Test-Path $localZip) { $zip = $localZip }
      else {
        Write-Host "Downloading the Windows runtime ($asset). First launch only..."
        Invoke-WebRequest -UseBasicParsing "$base/$asset" -OutFile $zip
      }
      if ((Get-FileHash -Algorithm SHA256 $zip).Hash -ine $entry.Substring(0,64)) { throw 'Runtime integrity check failed.' }
      $unpacked = Join-Path $temp 'unpacked'
      Expand-Archive -LiteralPath $zip -DestinationPath $unpacked
      if (-not (Test-Path (Join-Path $unpacked 'electron.exe'))) { throw 'Incomplete runtime archive.' }
      [IO.Directory]::Move($unpacked,(Join-Path $target 'runtime'))
    } finally { if (Test-Path $temp) { Remove-Item -Recurse -Force $temp } }
  }
  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'FloatInbox.lnk'))
  $shortcut.TargetPath = $exe
  $shortcut.Arguments = '"' + $target + '"'
  $shortcut.WorkingDirectory = $target
  $shortcut.Save()
  Start-Process -FilePath $exe -ArgumentList ('"' + $target + '"') -WorkingDirectory $target
  Write-Host "Started FloatInbox from $target"
} catch {
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "If the runtime download failed, retry Setup-D.cmd. Offline instructions: README.md"
  exit 1
}
