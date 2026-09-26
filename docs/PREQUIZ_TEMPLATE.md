# 課前考 Word 模板

`templates/pre_tpl.docx` 從已確認 ABK 模板衍生，只有兩類差異：原生課前考標頭、所有分節改單欄。其他正文段落、ruler、清單編號、題組框、字型、B4 紙張、浮水印和頁尾不變。原始 ABK 檔未修改。

重建工具：`tools/build_prequiz_template.py --abk templates/abk_tpl.docx --header-source SOURCE.docx --output NEW.docx`。輸出既存時拒絕覆寫；工具驗證原 ABK 41 個未變更 part 及正文 slot 的 canonical 保真。

新標頭欄位為 `subject`、`book`、`quiz_label`、`running_header`。內文仍為 ABK 的 sections/items/passage/text/imgs loops。

網站已接上 `downloadWordViaTemplate('pre')`，填入上述四個標頭欄位，使用原生大題名稱、B4 單欄與相同的等比例隨文圖片規則。範本失敗時停止並提示，不能默默回退到 A4 generic Word。

網頁預覽與 PDF 採用固定 B4 畫布和灰階課前考卷頭，所有題目實際量測分頁，不是前三題假預覽。瀏覽器的字型度量與 Word 原生形狀仍可能造成差異，不保證逐像素或分頁完全相同。匯出課前考標頭的 `subject` 由科目欄位決定，`book` 使用冊次，`quiz_label` 使用考卷名稱，`running_header` 為「福大自然 課前考」。

可攜生成、驗證、測試脚本已包在個人模板 skill artifact-template-prequiz 中，與既有 ABK skill 互相獨立。
