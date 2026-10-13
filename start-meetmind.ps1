# Starts MeetMind on this PC: the local AI (Ollama), the API and the website.
# Run it from PowerShell:  .\start-meetmind.ps1   then open http://localhost:5173
# Settings (data folder, AI mode, tokens) are in backend\.env.

$root = $PSScriptRoot
$ffmpeg = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WinGet\Packages" -Recurse -Filter ffmpeg.exe -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (-not (Get-Process ollama -ErrorAction SilentlyContinue)) {
    Start-Process "$env:LOCALAPPDATA\Programs\Ollama\ollama.exe" -ArgumentList serve -WindowStyle Hidden
}

$python = if (Test-Path "$root\backend\.venv-gpu") { ".venv-gpu" } else { ".venv" }
$path = if ($ffmpeg) { "`$env:PATH = '$($ffmpeg.DirectoryName);' + `$env:PATH; " } else { "" }
Start-Process powershell -WorkingDirectory "$root\backend" -ArgumentList '-NoExit', '-Command',
    "`$host.UI.RawUI.WindowTitle = 'MeetMind API'; $path.\$python\Scripts\python.exe -m uvicorn app.main:app --port 8000"
Start-Process powershell -WorkingDirectory "$root\frontend" -ArgumentList '-NoExit', '-Command',
    "`$host.UI.RawUI.WindowTitle = 'MeetMind website'; npm run dev"

Write-Host "MeetMind is starting. Open http://localhost:5173 in a minute."
