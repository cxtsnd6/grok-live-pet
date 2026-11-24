param([switch]$Automatic)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')
$root = (Get-Item -LiteralPath (Join-Path $PSScriptRoot '..')).FullName

if (!(Test-Path -LiteralPath $PetElectronExe -PathType Leaf)) {
    if ($Automatic) { return }
    throw 'Run scripts/setup.ps1 to install the Windows runtime.'
}

$arguments = @('"' + $root + '"')
if ($Automatic) { $arguments += '--automatic' }
Start-Process -FilePath $PetElectronExe -ArgumentList $arguments -WorkingDirectory $root -WindowStyle Normal
