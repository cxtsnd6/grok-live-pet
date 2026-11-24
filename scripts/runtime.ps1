$PetElectronVersion = '45.4.1'
$PetElectronArchive = "electron-v$PetElectronVersion-win32-x64.zip"
$PetElectronSha256 = '2ba6223afa9121f42831fefe92c434334907540165294fc56697449d12e7cfe9'
$PetStorage = Join-Path $env:LOCALAPPDATA 'GrokLivePet'
$PetRuntime = Join-Path $PetStorage "runtime/electron-$PetElectronVersion"
$PetElectronExe = Join-Path $PetRuntime 'electron.exe'
