# Packs the MeetCite source code into one zip for uploading to a server (VPS).
#
#   .\deploy\make-server-package.ps1
#
# Leaves out everything the server rebuilds or must never receive: virtual environments,
# node_modules, build output, caches, local data, recordings, your .env files with API keys, and
# group documents (Word/PDF files with names and student IDs).
$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$out = Join-Path $PSScriptRoot "meetcite-server.zip"

$skipDirs = @(".venv", ".venv-gpu", "node_modules", "dist", "test-results", "playwright-report", ".mypy_cache",
    ".pytest_cache", ".ruff_cache", "__pycache__", "data", "data-demo", "data-e2e", ".git", ".claude")
$skipFiles = @(".env", "*.zip", "*.db", "*.db-journal", "*.log", "*.docx", "*.pdf", "*.webm", "*.mp3", "*.wav", "*.m4a",
    "*.mp4")

Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
if (Test-Path $out) { Remove-Item $out -Force }
$zip = [System.IO.Compression.ZipFile]::Open($out, "Create")
$count = 0
try {
    Get-ChildItem $root -Recurse -File -Force | Where-Object {
        $file = $_
        $folders = @(($file.FullName.Substring($root.Length + 1) -split '[\\/]') | Select-Object -SkipLast 1)
        $inSkippedFolder = @($folders | Where-Object { $skipDirs -contains $_ }).Count -gt 0
        $isSkippedFile = @($skipFiles | Where-Object { $file.Name -like $_ }).Count -gt 0
        -not $inSkippedFolder -and -not $isSkippedFile
    } | ForEach-Object {
        $name = $_.FullName.Substring($root.Length + 1).Replace('\', '/')
        [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $_.FullName, "meetcite/$name")
        $count++
    }
}
finally { $zip.Dispose() }
"{0} files, {1:N1} MB -> {2}" -f $count, ((Get-Item $out).Length / 1MB), $out
