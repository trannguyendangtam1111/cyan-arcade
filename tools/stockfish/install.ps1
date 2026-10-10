# Installs the pinned official Stockfish release for local development on Windows, into
# tools\stockfish\dist\.
#
#   powershell -ExecutionPolicy Bypass -File tools\stockfish\install.ps1
#
# Downloads the release asset from the official repository's GitHub release, checks its SHA-256
# against the value pinned below (GitHub's published digest for that asset), and unpacks it. Run it
# once; the backend finds dist\stockfish.exe by default, or set STOCKFISH_PATH. See README.md here.
$ErrorActionPreference = 'Stop'

$Version = '19'
$Asset = 'stockfish-windows-x86-64-universal.zip'
$Sha256 = '3c8bf1f9ea66a09350a40df4f632288285ac206d99f33ab5842c408fc30b48a7'
$Url = "https://github.com/official-stockfish/Stockfish/releases/download/sf_$Version/$Asset"

$Dist = Join-Path $PSScriptRoot 'dist'
$Work = Join-Path ([System.IO.Path]::GetTempPath()) ("stockfish-" + [guid]::NewGuid())
New-Item -ItemType Directory -Path $Work | Out-Null
try {
    Write-Host "Downloading $Asset (Stockfish $Version)..."
    $ProgressPreference = 'SilentlyContinue'
    Invoke-WebRequest -Uri $Url -OutFile (Join-Path $Work $Asset) -UseBasicParsing

    $Actual = (Get-FileHash -Algorithm SHA256 (Join-Path $Work $Asset)).Hash.ToLowerInvariant()
    if ($Actual -ne $Sha256) {
        throw "Checksum mismatch for ${Asset}: expected $Sha256, got $Actual. Nothing was installed."
    }

    Expand-Archive -Path (Join-Path $Work $Asset) -DestinationPath (Join-Path $Work 'unpacked')
    if (Test-Path $Dist) { Remove-Item -Recurse -Force $Dist }
    New-Item -ItemType Directory -Path $Dist | Out-Null
    # The release's licence, authors and source code go along with the binary (GPL-3.0).
    Move-Item (Join-Path $Work 'unpacked\stockfish') (Join-Path $Dist "stockfish-$Version")
    Move-Item (Join-Path $Dist "stockfish-$Version\stockfish-windows-x86-64-universal.exe") (Join-Path $Dist 'stockfish.exe')
    Write-Host "Installed Stockfish $Version in $Dist (licence and source in $Dist\stockfish-$Version)."
}
finally {
    Remove-Item -Recurse -Force $Work -ErrorAction SilentlyContinue
}
