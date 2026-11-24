param([switch]$NoStart)

$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'runtime.ps1')

if (!$IsWindows -and $env:OS -ne 'Windows_NT') {
    throw 'Grok Live Pet requires Windows 10 or 11.'
}
if ($env:PROCESSOR_ARCHITECTURE -ne 'AMD64') {
    throw 'This release includes the Windows x64 desktop runtime.'
}

if (!(Test-Path -LiteralPath $PetElectronExe -PathType Leaf)) {
    $runtimeRoot = [System.IO.Directory]::CreateDirectory((Join-Path $PetStorage 'runtime')).FullName
    $stage = [System.IO.Directory]::CreateDirectory((Join-Path $runtimeRoot ([guid]::NewGuid().ToString('N')))).FullName
    $archive = Join-Path $stage $PetElectronArchive
    $unpacked = Join-Path $stage 'electron'
    try {
        $url = "https://github.com/electron/electron/releases/download/v$PetElectronVersion/$PetElectronArchive"
        Write-Host "Downloading Electron $PetElectronVersion for Windows x64"
        $ProgressPreference = 'SilentlyContinue'
        Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $archive -TimeoutSec 300
        if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ine $PetElectronSha256) {
            throw 'Electron archive SHA-256 does not match.'
        }
        Expand-Archive -LiteralPath $archive -DestinationPath $unpacked
        try {
            [System.IO.Directory]::Move($unpacked, $PetRuntime)
        } catch [System.IO.IOException] {
            if (!(Test-Path -LiteralPath $PetElectronExe -PathType Leaf)) { throw }
        }
    } finally {
        $cleanup = [System.IO.Path]::GetFullPath($stage)
        $prefix = $runtimeRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
        if ($cleanup.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
            Remove-Item -LiteralPath $cleanup -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
}

Write-Host "Grok Live Pet runtime is ready at $PetRuntime"
if (!$NoStart) { & (Join-Path $PSScriptRoot 'start.ps1') }
