# Builds the ZiziOCR local program (Windows). ASCII only: Windows PowerShell 5.1 misreads UTF-8 without BOM.
# Usage: build.ps1 -Ocr <exam-answer-key-formatter path> -Models <folder with det.onnx, rec.onnx> -Work <work folder>
# Needs Python 3.11 with ocr/requirements.txt packages, python-docx, openpyxl, pyinstaller.
param(
  [Parameter(Mandatory)] [string] $Ocr,
  [Parameter(Mandatory)] [string] $Models,
  [Parameter(Mandatory)] [string] $Work,
  [string] $Python = "python"
)
$ErrorActionPreference = "Continue"   # PyInstaller logs to stderr; failure is checked via LASTEXITCODE
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
& $Python -m PyInstaller --noconfirm --clean --onedir --console --name ZiziOCR `
  --distpath "$Work\dist" --workpath "$Work\build" --specpath "$Work" `
  --paths "$Ocr\ocr" --paths "$Ocr\exam-to-word\scripts" `
  --hidden-import pyexam --hidden-import to_zizi_word --hidden-import to_qbank_xlsx --hidden-import buildlib --hidden-import ppocr_engine `
  --collect-all rapidocr_onnxruntime --collect-data opencc --collect-data docx --collect-binaries onnxruntime `
  --add-data "$Models\det.onnx;models" --add-data "$Models\rec.onnx;models" `
  --add-data "$Ocr\ocr\models\ppocrv5_dict.txt;models" --add-data "$Ocr\ocr\models\dehand.json;ocr\models" `
  --add-data "$Ocr\exam-to-word\assets\template.docx;assets" `
  --exclude-module torch --exclude-module tkinter --exclude-module matplotlib `
  "$here\zizi_ocr_local.py"
if ($LASTEXITCODE -ne 0) { throw "PyInstaller failed" }
Compress-Archive -Force -Path "$Work\dist\ZiziOCR" -DestinationPath "$Work\ZiziOCR-windows.zip"
Get-Item "$Work\ZiziOCR-windows.zip" | Select-Object Name, @{n='MB';e={[math]::Round($_.Length/1MB)}}
