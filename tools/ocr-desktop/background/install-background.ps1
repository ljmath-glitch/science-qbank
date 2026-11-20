# ZiziOCR 本機程式：改成背景執行（沒有黑視窗，登入後自動啟動）。重複執行是安全的。
# 做法：找到 ZiziOCR.exe → 產生「隱藏啟動」的小檔 → 放進「啟動」資料夾 → 現在就用隱藏方式啟動。
# 用法：雙擊「ZiziOCR背景執行.bat」；找不到 ZiziOCR.exe 時，把 ZiziOCR.exe 拖進視窗再按 Enter。
param([string]$Exe = '')
$ErrorActionPreference = 'Stop'
function Say($m, $c = 'White') { Write-Host $m -ForegroundColor $c }

# 1) 找 ZiziOCR.exe
if (-not $Exe) {
  $found = @()
  foreach ($d in @("$env:USERPROFILE\Downloads", "$env:USERPROFILE\Desktop", "$env:USERPROFILE\Documents", 'C:\ZiziOCR', 'C:\')) {
    if (Test-Path $d) { $found += Get-ChildItem -Path $d -Filter ZiziOCR.exe -Recurse -Depth 3 -ErrorAction SilentlyContinue }
  }
  if ($found) { $Exe = ($found | Sort-Object LastWriteTime -Descending | Select-Object -First 1).FullName }
}
if (-not $Exe -or -not (Test-Path $Exe)) {
  Say '找不到 ZiziOCR.exe。請把 ZiziOCR.exe 拖進這個視窗（會出現路徑），再按 Enter：' Yellow
  $Exe = (Read-Host).Trim('"', ' ')
}
if (-not (Test-Path $Exe)) { Say '路徑不對，沒有做任何變更。' Red; exit 1 }
$Exe = (Resolve-Path $Exe).Path
$dir = Split-Path $Exe -Parent
Say "使用：$Exe" Green

# 2) 關掉正在跑、有黑視窗的舊程式
Get-Process -Name ZiziOCR -ErrorAction SilentlyContinue | ForEach-Object { try { Stop-Process -Id $_.Id -Force } catch {} }
Start-Sleep -Seconds 1

# 3) 隱藏啟動器（視窗樣式 0＝完全不顯示）。用 Unicode 存檔，路徑有中文也沒問題
$vbs = Join-Path $dir 'ZiziOCR-hidden.vbs'
$code = @"
Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "$dir"
sh.Run """$Exe""", 0, False
"@
Set-Content -LiteralPath $vbs -Value $code -Encoding Unicode

# 4) 登入時自動啟動（放進「啟動」資料夾）
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'ZiziOCR（背景）.lnk'
$w = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$w.TargetPath = 'wscript.exe'; $w.Arguments = "//B //Nologo `"$vbs`""; $w.WorkingDirectory = $dir; $w.Description = 'ZiziOCR 本機程式（背景執行）'; $w.Save()

# 5) 現在就用隱藏方式啟動，並確認 18787 埠有開
Start-Process -FilePath 'wscript.exe' -ArgumentList "//B //Nologo `"$vbs`""
$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 1
  if (Get-NetTCPConnection -LocalPort 18787 -State Listen -ErrorAction SilentlyContinue) { $ok = $true; break }
}
if ($ok) {
  Say 'ZiziOCR 已在背景執行（沒有黑視窗），之後登入電腦也會自動啟動。' Green
  Say '回到題庫網頁，把「OCR 運算主機」選「本機」，按「測試連線」確認。' Green
  Say '要停止：雙擊「停止ZiziOCR.bat」。' White
} else {
  Say '還沒偵測到 ZiziOCR 啟動（18787 埠沒開）。可能還在載入，請等 1 分鐘後回網頁按「測試連線」；仍不行請告訴管理者。' Yellow
}
