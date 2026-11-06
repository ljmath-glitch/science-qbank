# 段考黃金模擬考

來源為使用者的「黃金模擬考.docx」，SHA256
`822dbbfa81982c91136ce2956af36975c43f52c2d4baf424014b67b8344bf98d`。
來源九頁已渲染檢查；只引用卷頭及頁尾，不匯入其示例題目。

使用者確認改為 B4 直式、課前考四邊界 1.27 cm、單欄正文。
不是原始 A4／1 cm 的直接複製。

## 格式契約

- 保留原生三列標頭表格及合併欄位、右靠考次／範圍／學生欄、14 pt
  粗體 Times New Roman／芫荽，學年度、學期、科目、版本、範圍與考次可編輯。
- 表格按原欄寬比例展開至 B4，原有 80 twips 左定位保留。
- 原始 Logo 為獨立 PNG：273×327 pixels，Word extent 保留
  1133475×1360170 EMU；網頁 width 119 px、height auto，禁止拉伸。
- 大標頭只在第一頁；沒有 ABK 浮水印，也沒有課前考灰階橫幅。
- 頁尾保留「茲茲　PAGE　科目」的原生 PAGE 欄位。
- 題目、大題、題組框、ruler、字級、段落、隨文圖、公式清理完全共用
  pre_tpl 的正文，沒有重新套 Word 預設樣式。題組框寬 8337550 EMU。
- 標頭用隔離的 GoldenSource_ 樣式，避免改動正文或其他卷別。
- 來源範例 114 年、考次與範圍不作新考卷預設資料；未填欄位顯示空格。

## 檔案與測試

`templates/golden_tpl.docx` 是 Word 填入模板，不是已填好的考卷。
`tools/build_golden_template.py` 由 pre_tpl 和原始標頭文件建立；拒絕覆寫。
產生器核對正文節點與編號未變。與 prequiz 樣式差別只在卷頭與頁尾。

`tools/test_golden_editor.cjs` 測 Safari WebKit、Chrome：工具列／設定／預覽
同步、原生 Word 編號、B4 單欄、等比例 Logo、全寬題組框、完整多頁
輸出與切回 ABK／課前考。PDF 使用現有 full-page output，而非前三題示意。

字型保留來源指定；未安裝芫荽時，Word 與瀏覽器會各自替代字型，不能
宣稱像素或分頁完全一致。本次檢查使用 LibreOffice 渲染，不等同 Word
實機驗收。網頁標頭首行和正文起點按 B4 匯出的實體位置校準。

國九模擬考題本尚未取得模板，不以這份黃金模擬考代替。
