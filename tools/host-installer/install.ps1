param(
    [string]$Source = (Join-Path $PSScriptRoot '詳解應用'),
    [string]$RequestedDisplayName = $env:ZIZI_HOST_DISPLAY_NAME
)
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = New-Object Text.UTF8Encoding($false)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$homeDir = Join-Path $env:LOCALAPPDATA 'ZiziHost'
$stateFile = Join-Path $homeDir 'installed.json'
$installLock = New-Object System.Threading.Mutex($false, 'Local\ZiziHostInstall')
if (-not $installLock.WaitOne(0)) { Write-Host '已有安裝或更新正在進行。'; exit 1 }
$previous = $null
$switched = $false
$runningRoots = @()

function Refresh-Path {
    $env:Path = [Environment]::GetEnvironmentVariable('Path', 'Machine') + ';' + [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path += ';' + (Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps')
    $env:Path += ';' + (Join-Path $env:LOCALAPPDATA 'Programs\Python\Launcher')
}

function Install-Package([string]$Id) {
    if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
        throw '找不到 winget。請先從 Microsoft Store 更新「應用程式安裝程式」，再重新執行。'
    }
    Write-Host "正在安裝 $Id，Windows 可能要求確認安裝…" -ForegroundColor Cyan
    & winget install --id $Id --exact --source winget --disable-interactivity
    if ($LASTEXITCODE -ne 0) { throw "$Id 安裝未完成，結束碼 $LASTEXITCODE。請查看上方訊息後重試。" }
    Refresh-Path
}

function Run-Step([string]$Path, [string[]]$Arguments = @()) {
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $Path @Arguments
    if ($LASTEXITCODE -ne 0) { throw "安裝步驟失敗：$Path（結束碼 $LASTEXITCODE）" }
}

try {
    $release = Get-Content -Raw -Encoding UTF8 -LiteralPath (Join-Path $PSScriptRoot 'version.json') | ConvertFrom-Json
    if (Test-Path -LiteralPath $stateFile) { $previous = Get-Content -Raw -Encoding UTF8 -LiteralPath $stateFile | ConvertFrom-Json }
    if (-not $previous) {
        $oldTask = Get-ScheduledTask -TaskName '茲茲主機背景服務' -ErrorAction SilentlyContinue
        if ($oldTask -and $oldTask.Actions[0].WorkingDirectory) {
            $oldRoot = Split-Path $oldTask.Actions[0].WorkingDirectory -Parent
            if (Test-Path -LiteralPath (Join-Path $oldRoot 'local-app\host-supervisor.js')) { $previous = [pscustomobject]@{path=$oldRoot;version='0.0.0';modelVersion='unknown'} }
        }
    }
    # 以實際監聽服務辨認舊版，避免既有狀態檔指向上次失敗的安裝。
    $hostProcesses = @(Get-CimInstance Win32_Process -Filter "Name='node.exe'")
    foreach ($connection in @(Get-NetTCPConnection -LocalPort 8787 -State Listen -ErrorAction SilentlyContinue)) {
        $serverProcess = $hostProcesses | Where-Object ProcessId -eq $connection.OwningProcess | Select-Object -First 1
        if ($serverProcess.CommandLine -match '([A-Za-z]:\\[^"\r\n]*?)\\local-app\\server\.js"?\s*$') {
            $liveRoot = $Matches[1]
            if (Test-Path -LiteralPath (Join-Path $liveRoot 'local-app\host-supervisor.js')) {
                if (-not $previous -or $previous.path -ne $liveRoot) { $previous = [pscustomobject]@{path=$liveRoot;version='0.0.0';modelVersion='unknown'} }
                break
            }
        }
    }
    if ($previous) { $runningRoots += $previous.path }
    foreach ($process in $hostProcesses) {
        if ($process.CommandLine -match '([A-Za-z]:\\[^"\r\n]*?)\\local-app\\host-supervisor\.js"?\s*$') {
            $candidate = [IO.Path]::GetFullPath($Matches[1])
            if ($candidate.StartsWith(([IO.Path]::GetFullPath($homeDir) + '\'),[StringComparison]::OrdinalIgnoreCase)) { $runningRoots += $candidate }
        }
    }
    $runningRoots = @($runningRoots | Select-Object -Unique)
    foreach ($relative in @('package.json','ocr\requirements.txt','local-app\prepare-ocr-env.ps1','local-app\install-host-service.ps1','exam-to-word\scripts\buildlib.py','exam-to-word\assets\template.docx')) {
        if (-not (Test-Path -LiteralPath (Join-Path $Source $relative))) { throw "安裝包缺少 $relative。請用 -Source 指定解壓縮後的「詳解應用」資料夾。" }
    }
    Refresh-Path
    if (-not (Get-Command node -ErrorAction SilentlyContinue)) { Install-Package 'OpenJS.NodeJS.LTS' }
    $pythonReady = $false
    try {
        & py -3.11 -c 'import sys; assert sys.version_info[:2] == (3,11)' 2>$null
        $pythonReady = $LASTEXITCODE -eq 0
    } catch {}
    if (-not $pythonReady) { Install-Package 'Python.Python.3.11' }
    & py -3.11 -c 'import sys; assert sys.version_info[:2] == (3,11)'
    if ($LASTEXITCODE -ne 0) { throw 'Python 3.11 尚無法執行，請重新開啟安裝程式。' }
    $tailscale = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
    if (-not (Test-Path -LiteralPath $tailscale)) { Install-Package 'Tailscale.Tailscale' }
    if (-not (Get-Command pdftotext -ErrorAction SilentlyContinue)) { Install-Package 'oschwartz10612.Poppler' }
    if (-not (Get-Command pdftotext -ErrorAction SilentlyContinue)) { throw 'Poppler 安裝後尚未出現在 PATH，請重新開啟安裝程式。' }
    # 每次建立獨立安裝目錄，保留既有主機程式、設定與日誌。
    $target = Join-Path $env:LOCALAPPDATA ('ZiziHost\install-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $target -Recurse -Force
    $displayName = $env:COMPUTERNAME
    if ($previous -and (Test-Path -LiteralPath (Join-Path $previous.path 'local-app\host-config.json'))) {
        Copy-Item -LiteralPath (Join-Path $previous.path 'local-app\host-config.json') -Destination (Join-Path $target 'local-app\host-config.json')
        $cfg = Get-Content -Raw -Encoding UTF8 (Join-Path $target 'local-app\host-config.json') | ConvertFrom-Json
        if ($cfg.displayName) { $displayName = $cfg.displayName }
    }
    $previousName = $displayName
    if ($RequestedDisplayName) {
        $RequestedDisplayName = $RequestedDisplayName.Trim()
        if (-not $RequestedDisplayName -or $RequestedDisplayName.Length -gt 20 -or $RequestedDisplayName -match '[\x00-\x1f"]') { throw '主機名稱須為 1～20 字，不能包含雙引號或換行。' }
        $displayName = $RequestedDisplayName
    }
    Write-Host "主機安裝位置：$target" -ForegroundColor Cyan
    $env:OCR_VENV = Join-Path $target '.venv'
    Run-Step (Join-Path $target 'local-app\prepare-ocr-env.ps1')
    # 在切換服務前下載並實際載入自動切圖模型，失敗時仍保留原服務。
    $venvPython = Join-Path $target '.venv\Scripts\python.exe'
    Write-Host '準備自動切圖 PP-DocLayout v3 模型…' -ForegroundColor Cyan
    & $venvPython -c "from rapid_layout import RapidLayout; engine = RapidLayout(model_type='pp_doc_layoutv3'); print('Automatic crop model ready')"
    if ($LASTEXITCODE -ne 0) { throw '自動切圖模型準備失敗，請檢查網路後重試。' }
    Push-Location $target
    try {
        & $venvPython -c "import sys; sys.path.insert(0, 'exam-to-word/scripts'); import buildlib, openpyxl; print('Excel dependencies ready')"
        if ($LASTEXITCODE -ne 0) { throw 'Excel 轉檔依賴檢查失敗。' }
        & npm.cmd install --omit=dev
        if ($LASTEXITCODE -ne 0) { throw 'Node.js 套件安裝失敗，請查看上方錯誤。' }
    } finally { Pop-Location }
    # 通知既有新版系統匣結束，避免它的看守程序把舊服務重新啟動。
    try { $activeHealth = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 5 } catch { $activeHealth = $null }
    if ($activeHealth -and $activeHealth.queue -and $activeHealth.queue.waiting -gt 0) { throw '目前還有 OCR 或切圖工作，請等考卷處理完成後再按更新。' }
    $switched = $true
    foreach ($oldRoot in $runningRoots) {
        $restartFlag = Join-Path $oldRoot 'local-app\output\update-stop.flag'
        New-Item -ItemType Directory -Force (Split-Path $restartFlag) | Out-Null
        Set-Content -LiteralPath $restartFlag -Value 'update' -Encoding ASCII
    }
    if ($runningRoots.Count) { Start-Sleep -Seconds 7 }
    foreach ($oldRoot in $runningRoots) {
        $oldTray = Join-Path $oldRoot 'local-app\host-tray.ps1'
        Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object {
            $_.CommandLine -and $_.CommandLine.IndexOf($oldTray,[StringComparison]::OrdinalIgnoreCase) -ge 0
        } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
        $oldSupervisor = Join-Path $oldRoot 'local-app\host-supervisor.js'
        Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
            $_.CommandLine -and $_.CommandLine.IndexOf($oldSupervisor,[StringComparison]::OrdinalIgnoreCase) -ge 0
        } | ForEach-Object {
            & taskkill.exe /PID $_.ProcessId /T /F
            if ($LASTEXITCODE -ne 0) { throw '停止舊主機失敗，請重試。' }
        }
        foreach ($file in @('server.js','ai-bridge.cjs')) {
            $oldFile = Join-Path $oldRoot ('local-app\' + $file)
            Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
                $_.CommandLine -and $_.CommandLine.IndexOf($oldFile,[StringComparison]::OrdinalIgnoreCase) -ge 0
            } | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction Stop }
        }
    }
    Run-Step (Join-Path $target 'local-app\install-host-service.ps1') @('-DisplayName', $displayName)
    $health = Invoke-RestMethod -Uri 'http://127.0.0.1:8787/api/health' -TimeoutSec 10
    if ($health.service -ne 'tzutzu-ocr' -or $health.installId -ne (Split-Path $target -Leaf)) { throw '背景服務安裝後，新版 OCR 主機身分檢查未通過。' }
    $updaterDir = Join-Path $target 'updater'
    New-Item -ItemType Directory -Force $updaterDir | Out-Null
    Copy-Item -LiteralPath (Join-Path (Split-Path $PSScriptRoot -Parent) '茲茲主機安裝.exe') -Destination (Join-Path $updaterDir '茲茲主機安裝.exe')
    $action = New-ScheduledTaskAction -Execute (Join-Path $updaterDir '茲茲主機安裝.exe') -Argument '--updates' -WorkingDirectory $updaterDir
    $triggers = @((New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME), (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)))
    $settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Seconds 0)
    Register-ScheduledTask -TaskName '茲茲主機更新提醒' -Action $action -Trigger $triggers -Settings $settings -Force | Out-Null
    Start-ScheduledTask -TaskName '茲茲主機更新提醒'
    $newState = @{path=$target;version=$release.version;modelVersion=$release.modelVersion} | ConvertTo-Json
    $pendingState = Join-Path $homeDir 'installed.pending.json'
    [IO.File]::WriteAllText($pendingState,$newState,(New-Object Text.UTF8Encoding($false)))
    Move-Item -LiteralPath $pendingState -Destination $stateFile -Force
    Write-Host 'OCR 主機已安裝並通過連線檢查。請確認 Tailscale 已登入；AI 分類需要此電腦的 AI 工具已登入。' -ForegroundColor Green
    Write-Host "主機在網站上顯示為：$displayName；版本 $($release.version)。之後有更新會從系統匣通知，點通知即可更新。"
    exit 0
} catch {
    Write-Host ('安裝未完成：' + $_.Exception.Message) -ForegroundColor Red
    if ($switched -and $previous) {
        Write-Host '正在恢復原本的主機服務…' -ForegroundColor Yellow
        try {
            $failedFlag = Join-Path $target 'local-app\output\update-stop.flag'
            New-Item -ItemType Directory -Force (Split-Path $failedFlag) | Out-Null
            Set-Content -LiteralPath $failedFlag -Value 'rollback' -Encoding ASCII
            Start-Sleep -Seconds 7
            foreach ($file in @('host-supervisor.js','server.js','ai-bridge.cjs')) {
                $failedFile = Join-Path $target ('local-app\' + $file)
                Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
                    $_.CommandLine -and $_.CommandLine.IndexOf($failedFile,[StringComparison]::OrdinalIgnoreCase) -ge 0
                } | ForEach-Object { & taskkill.exe /PID $_.ProcessId /T /F | Out-Null }
            }
            Remove-Item -LiteralPath (Join-Path $previous.path 'local-app\output\update-stop.flag') -ErrorAction SilentlyContinue
            Run-Step (Join-Path $previous.path 'local-app\install-host-service.ps1') @('-DisplayName', $previousName)
        } catch { Write-Host ('恢復原服務失敗，請從原安裝目錄重新啟動：' + $_.Exception.Message) -ForegroundColor Red }
    }
    exit 1
} finally {
    $installLock.ReleaseMutex()
    $installLock.Dispose()
}
