# Builds the MeetCite website for shared hosting (e.g. HostAfrica) and packs it into one zip.
#
#   .\deploy\build-website.ps1 -ApiUrl https://api.your-domain.com
#
# Then upload deploy\meetcite-website.zip into the website folder in DirectAdmin's File Manager
# and extract it there. See docs\DEPLOYMENT.md.
param(
    [Parameter(Mandatory = $true)]
    [string]$ApiUrl
)

$ErrorActionPreference = "Stop"
if ($ApiUrl -notmatch '^https://') { throw "ApiUrl must start with https:// (browsers block an http API from an https site)." }

$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $PSScriptRoot "meetcite-website.zip"

Push-Location (Join-Path $root "frontend")
try {
    $env:VITE_API_URL = $ApiUrl.TrimEnd('/')
    npm run build
    if ($LASTEXITCODE -ne 0) { throw "The website build failed." }
    Copy-Item (Join-Path $PSScriptRoot "hostafrica\.htaccess") "dist\.htaccess" -Force
    if (Test-Path $out) { Remove-Item $out -Force }
    # Zip the folder's contents (not the folder itself), including the hidden .htaccess. Entry names
    # use "/" - Windows PowerShell's Compress-Archive writes "\", which Linux servers mis-extract.
    Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
    $dist = (Resolve-Path "dist").Path
    $zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
    try {
        foreach ($file in Get-ChildItem $dist -Recurse -File -Force) {
            $name = $file.FullName.Substring($dist.Length + 1).Replace('\', '/')
            [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $file.FullName, $name)
        }
    }
    finally { $zip.Dispose() }
}
finally {
    Remove-Item Env:\VITE_API_URL -ErrorAction SilentlyContinue
    Pop-Location
}
Write-Host "Done: $out  (API: $ApiUrl)"
