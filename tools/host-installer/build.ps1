param([string]$Repo = 'C:\Users\ljmat\source\science-qbank')
$ErrorActionPreference = 'Stop'
$source = Join-Path $Repo 'tools\host-installer'
$stage = Join-Path $env:TEMP ('zizi-package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
Expand-Archive -LiteralPath (Join-Path $Repo 'downloads\zizi-host-windows.zip') -DestinationPath $stage
$app = Join-Path $stage '茲茲主機安裝'
$internal = Join-Path $app 'internal'
if (-not (Test-Path -LiteralPath (Join-Path $internal '詳解應用\package.json'))) { throw '請以應用程式版安裝 ZIP 作為基底。' }
Copy-Item -LiteralPath (Join-Path $source 'install.ps1'),(Join-Path $source 'version.json'),(Join-Path $source 'ZiziHostInstaller.cs'),(Join-Path $source 'ZiziHostUpdates.cs') -Destination $internal -Force
Get-ChildItem -LiteralPath (Join-Path $source 'payload-overrides') | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $internal '詳解應用') -Recurse -Force
}
# Windows PowerShell 5.1 需要 BOM 才能正確讀取中文腳本。
Get-ChildItem -LiteralPath $internal -Recurse -Filter '*.ps1' | ForEach-Object {
    $body = [IO.File]::ReadAllText($_.FullName)
    [IO.File]::WriteAllText($_.FullName,$body,(New-Object Text.UTF8Encoding($true)))
    $tokens=$null; $errors=$null
    [Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors) | Out-Null
    if ($errors.Count) { throw "PowerShell 語法錯誤：$($_.FullName) $errors" }
}
# 舊版 .NET 編譯器的來源參數使用 ASCII 暫存路徑，避免中文路徑編碼問題。
Copy-Item -LiteralPath (Join-Path $source 'ZiziHostInstaller.cs'),(Join-Path $source 'ZiziHostUpdates.cs') -Destination $stage
Push-Location $stage
try {
    & "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\csc.exe" /nologo /target:winexe /reference:System.Windows.Forms.dll /reference:System.Drawing.dll /reference:System.Net.Http.dll /reference:System.Web.Extensions.dll /reference:System.IO.Compression.dll /reference:System.IO.Compression.FileSystem.dll /out:Installer.exe ZiziHostInstaller.cs ZiziHostUpdates.cs
    if ($LASTEXITCODE -ne 0) { throw '編譯失敗。' }
} finally { Pop-Location }
Copy-Item -LiteralPath (Join-Path $stage 'Installer.exe') -Destination (Join-Path $app '茲茲主機安裝.exe') -Force
foreach ($arg in @('--test-updates','--check-package')) {
    $test = Start-Process -FilePath (Join-Path $app '茲茲主機安裝.exe') -ArgumentList $arg -Wait -PassThru -WindowStyle Hidden
    if ($test.ExitCode -ne 0) { throw "測試失敗：$arg ($($test.ExitCode))" }
}
$zip = Join-Path $Repo 'downloads\zizi-host-windows.zip'
Compress-Archive -LiteralPath $app -DestinationPath $zip -Force
$version = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $source 'version.json') | ConvertFrom-Json
$feed = [ordered]@{version=$version.version;modelVersion=$version.modelVersion;sha256=(Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash.ToLowerInvariant();notes='自動切圖模型預先準備；新版程式與模型通知，一鍵更新。'}
$json = $feed | ConvertTo-Json
[IO.File]::WriteAllText((Join-Path $Repo 'downloads\host-update.json'),$json,(New-Object Text.UTF8Encoding($false)))
Write-Output "完成版本 $($version.version)，SHA256 $($feed.sha256)"
Write-Output "測試與編譯目錄：$app"
