$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$workspace = Split-Path -Parent $PSScriptRoot
$destination = Join-Path $workspace '.tools\rive'
$version = '1.10.0'
$expectedSha = '2335335340e2b4fbf705bf3551010a11909cce6a3e31f03bfb9f04e678b6874d'
New-Item -ItemType Directory -Force -Path $destination | Out-Null
$archive = Join-Path $destination 'rive.tar.gz'
Invoke-WebRequest -Uri "https://releases.rive.app/cli/v$version/rive-windows-x64.tar.gz" -OutFile $archive -UseBasicParsing
if ((Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expectedSha) {
    throw 'Rive CLI checksum mismatch.'
}
# Only extract the named binary and bundled reference docs into this project.
tar -xzf $archive -C $destination rive.exe docs
if ($LASTEXITCODE -ne 0) { throw 'Rive extraction failed.' }
& (Join-Path $destination 'rive.exe') --version
