#!/bin/bash
# ============================================================
#  題庫 OCR 服務啟動器（macOS）：雙擊即啟動。
#  關掉這個終端機視窗 ＝ 停止服務。
#  OCR_ENGINE=auto：有文字層的 PDF 走文字層引擎，純掃描才走 MinerU。
#  安裝步驟見 README.md（先建立 venv 於 ~/ocr-env 並安裝套件）。
#  若你的 venv 不在 ~/ocr-env，改下面 VENV 這一行即可。
# ============================================================
cd "$(dirname "$0")"
VENV="$HOME/ocr-env"

export OCR_ENGINE=auto
export OCR_ALLOW_ORIGIN='*'
export MINERU_CMD="$VENV/bin/mineru"

echo "============================================================"
echo "  OCR 服務啟動中...  引擎 = $OCR_ENGINE"
echo "  成功會看到：Uvicorn running on http://0.0.0.0:8000"
echo "  請保持這個視窗開著；關閉視窗 ＝ 停止服務。"
echo "============================================================"

if [ ! -x "$VENV/bin/python" ]; then
  echo ""
  echo "找不到 $VENV/bin/python —— 還沒建立 venv 或路徑不同。"
  echo "請先照 README.md 的 macOS 步驟安裝，或修改本檔的 VENV 這一行。"
  echo ""
  read -n 1 -s -r -p "按任意鍵關閉..."
  exit 1
fi

"$VENV/bin/python" 題庫OCR_server.py

echo ""
echo "服務已結束。若上面有紅字錯誤，請把訊息截圖給 Claude。"
read -n 1 -s -r -p "按任意鍵關閉..."
