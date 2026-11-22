# 題目品質關規則 v0.1

本文件是 `tools/qa/quality_gate.py` 與 `review.html` 的共同規格。兩端皆以輸入 `{考卷名: [題目, ...]}` 檢查；欄位名稱為匯入格式的中文欄位（`題號`、`題目`、`答案`、`題型`、`圖表類型`、`題組文章`、`題組ID`、`大題`、`詳解`）。

## 判定方式

- 題目有任一 `block` 即為 block；沒有 block 但有任一 `warn` 即為 warn；其餘為 pass。
- 考卷層級旗標不歸屬特定題目，也不改變題目的 block/warn/pass 計數。
- `block` 表示不可啟用；`warn` 表示需要人工判讀。規則不會自行修正文字。
- 選項會從最後一段由 A 起、連續遞增的選項列擷取；有 E 時預期 A–E，否則預期 A–D。複選可含多個答案字母；是非題只允許 O/X/T/F/A/B 一個值。

## 題目層級規則

| Rule ID | 嚴重度 | 條件 |
| --- | --- | --- |
| `missing_image` | block | 題幹提及圖／表，且圖表類型為空、`無` 或不在允許類型。 |
| `possible_missing_image` | warn | 僅出現電路圖、流程圖、長條圖、圓餅圖等名詞，且圖表類型無效。 |
| `incomplete_options` | block | 選擇、複選或是非以外的選擇題，缺少預期選項或選項內容為空。 |
| `missing_answer` | block | 需要答案的題目答案為空。 |
| `answer_out_of_range` | block | 答案不在選項範圍，或單選／是非題不是一個值。 |
| `exam_end_noise` | warn | 題幹、題組文章或詳解含試題結束、請翻頁等版面雜訊。 |
| `page_number_noise` | warn | 含獨立頁碼樣式（如 `- 2 -`）。 |
| `page_label_noise` | warn | 含行首／行尾頁面標籤（如 `(2-1)`）。 |
| `trailing_figure_labels` | warn | 題末有連黏圖號。 |
| `flattened_exponent` | warn | 疑似科學記號次方壓平。 |
| `flattened_square_unit` | warn | 疑似平方／立方單位上標遺失。 |
| `flattened_subscript` | warn | 疑似常見化學式或變數下標壓平。 |
| `latex_option_label` | warn | LaTeX `\\mathrm{}` 內含選項標號。 |

## 考卷層級規則

題號以正整數檢查，遇到新題號 1 且已有題目（或有 `大題`）時分成新大題；每一大題都必須從 1 連續編號。題組中任一子題有題組文章即通過文章檢查。

| Rule ID | 嚴重度 | 條件 |
| --- | --- | --- |
| `invalid_question_number` | block | 任一題號不是正整數。 |
| `missing_first_question_number` | block | 某大題第一題不是 1。 |
| `duplicate_question_number` | block | 某大題題號重複。 |
| `missing_question_number` | block | 某大題題號不連續。 |
| `out_of_order_question_number` | warn | 題號順序倒退，可能是大題重編號。 |
| `missing_group_article` | block | 同一題組 ID 的全部子題都沒有題組文章。 |

## 實作相容性

JavaScript 與 Python 都先以 NFKC 概念正規化全形括號與答案符號。JavaScript 以瀏覽器 Unicode 正規化實作；舊瀏覽器不支援時仍應只略過正規化，而不可令頁面失敗。
