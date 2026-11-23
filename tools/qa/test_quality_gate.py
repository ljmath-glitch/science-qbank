import unittest
from quality_gate import check_data, check_question, check_numbering, option_parts
def rules(q): return {f["rule"] for f in check_question(q)}
class QualityGateTest(unittest.TestCase):
 def test_fullwidth_five_and_multiple(self):
  self.assertFalse({"incomplete_options","answer_out_of_range"}&rules({"題型":"選擇題","題目":"（Ａ）甲\nＢ.乙\n(C)丙\n(D)丁\n(E)戊","答案":"Ａ"}))
  self.assertNotIn("answer_out_of_range",rules({"題型":"複選題","題目":"(A)甲\n(B)乙\n(C)丙\n(D)丁","答案":"AB"}))
 def test_nonchoice_and_truefalse(self):
  self.assertNotIn("incomplete_options",rules({"題型":"計算題","題目":"求值","答案":"12"}))
  for answer in ("O","X","○","✕","T","F","A","B"): self.assertNotIn("answer_out_of_range",rules({"題型":"是非題","題目":"判斷","答案":answer}))
 def test_blank_type_truefalse_options_and_non_truefalse_two_options(self):
  question={"題目":"敘述。\n(A)正確\n(B)錯誤"}
  for answer in ("A","B","O","X","T","F"):
   self.assertFalse({"incomplete_options","answer_out_of_range"}&rules({**question,"答案":answer}))
  self.assertNotIn("incomplete_options",rules({"題目":"敘述。\n(A)是\n(B)否","答案":"A"}))
  self.assertNotIn("incomplete_options",rules({"題目":"敘述。\n(A)O\n(B)X","答案":"A"}))
  self.assertIn("incomplete_options",rules({"題目":"二選一。\n(A)甲\n(B)乙","答案":"A"}))
  self.assertIn("incomplete_options",rules({"題目":"缺 D 的四選一。\n(A)甲\n(B)乙\n(C)丙","答案":"A"}))
 def test_tail_options_avoid_stem_markers(self):
  p=option_parts("裝置 (A) 與點 (B)。\n(A)甲\n(B)乙\n(C)丙\n(D)丁")
  self.assertEqual((set(p),p["A"]),(set("ABCD"),"甲"))
  self.assertIn("incomplete_options",rules({"題型":"選擇題","題目":"(A)甲\n(B)乙\n(C)丙","答案":"A"}))
 def test_cjk_adjacent_option_markers(self):
  expected={"A":"甲","B":"乙","C":"丙","D":"丁"}
  self.assertEqual(option_parts("何者正確A.甲B.乙C.丙D.丁"),expected)
  self.assertEqual(option_parts("何者正確A.甲B.乙C.丙D. 丁"),expected)
 def test_image_reference_invalid_and_noun_only(self):
  self.assertIn("missing_image",rules({"題目":"如附圖所示","答案":"1","圖表類型":"待補"}))
  self.assertIn("possible_missing_image",rules({"題目":"電路圖的符號","答案":"1","圖表類型":"無"}))
 def test_group_aggregate_and_no_child_contagion(self):
  p=check_data({"卷":[{"題號":"1","題組ID":"g","題組文章":"如圖所示","題目":"第一題","答案":"1"},{"題號":"2","題組ID":"g","題目":"第二題","答案":"2"}]})["papers"][0]
  self.assertNotIn("missing_group_article",{f["rule"] for f in p["paper_flags"]}); self.assertNotIn("missing_image",{f["rule"] for f in p["questions"][1]["flags"]})
  self.assertIn("missing_group_article",{f["rule"] for f in check_data({"卷":[{"題號":"1","題組ID":"g","題目":"題","答案":"1"}]})["papers"][0]["paper_flags"]})
 def test_common_noise_notation_and_false_positives(self):
  found=rules({"題目":"題目 (7-2) 在句中 A4。\n- 1 -\nH2O、I1、3×1020、cm2、m/s2","詳解":"本卷結束","答案":"1"})
  self.assertTrue({"page_number_noise","flattened_exponent","flattened_square_unit","flattened_subscript","exam_end_noise"}<=found); self.assertNotIn("page_label_noise",found)
  self.assertNotIn("flattened_subscript",rules({"題目":"A4 和 B12 紙張","答案":"1"}))
 def test_unicode_super_and_subscripts_are_not_flattened(self):
  for notation in ("m/s²", "cm³", "10⁻⁹"):
   self.assertFalse({"flattened_exponent","flattened_square_unit","flattened_subscript"}&rules({"題目":notation,"答案":"1"}), notation)
  self.assertIn("flattened_square_unit",rules({"題目":"cm2","答案":"1"}))
  for notation in ("m/s2", "cm3", "m/s 2"):
   self.assertIn("flattened_square_unit",rules({"題目":notation,"答案":"1"}), notation)
  for notation in ("m/s²", "cm³", "m/s 20"):
   self.assertNotIn("flattened_square_unit",rules({"題目":notation,"答案":"1"}), notation)
  for notation in ("3×1020", "2.235 × 1010", "6×1023", "3\\times 1020"):
   self.assertIn("flattened_exponent",rules({"題目":notation,"答案":"1"}), notation)
  for notation in ("1000 × 1000", "2×1000", "3 × 10", "3 × 10+20", "3 × 10⁻²⁰"):
   self.assertNotIn("flattened_exponent",rules({"題目":notation,"答案":"1"}), notation)
 def test_flattened_subscript_chemical_cases(self):
  for notation in ("MnO2", "H2O", "CO2", "SO4"):
   self.assertIn("flattened_subscript",rules({"題目":notation,"答案":"1"}), notation)
  for notation in (r"\text{HCl(aq)}", r"\text{NaCl(s)}", "HCl", "NaCl", "HNO3", r"\text{H}_2\text{O}"):
   self.assertNotIn("flattened_subscript",rules({"題目":notation,"答案":"1"}), notation)
 def test_numbering_strict_paper_level_and_reset(self):
  found={f["rule"] for f in check_numbering([{"題號":"1"},{"題號":"3"},{"題號":"3"},{"題號":"2a"}])}; self.assertTrue({"missing_question_number","duplicate_question_number","invalid_question_number"}<=found)
  flags=check_numbering([{"題號":"1"},{"題號":"2"},{"題號":"1","大題":"二"},{"題號":"2","大題":"二"}]); self.assertNotIn("duplicate_question_number",{f["rule"] for f in flags})
  p=check_data({"卷":[{"題號":"2","題目":"題","答案":"1"}]})["papers"][0]; self.assertEqual(p["questions"][0]["flags"],[]); self.assertIn("missing_first_question_number",{f["rule"] for f in p["paper_flags"]})
 def test_garbled_symbols_and_repeated_punctuation(self):
  self.assertTrue({"garbled_text","isolated_symbol","repeated_punctuation"} <= rules({"題目":"量測結果� @ ！！","答案":"1"}))
  self.assertFalse({"garbled_text","isolated_symbol","repeated_punctuation"} & rules({"題目":"量測結果為 3.0 cm，是否正確？","答案":"1"}))
 def test_passage_content_in_normal_stem(self):
  article="小明觀察植物在陽光下進行光合作用。實驗持續三天，每天記錄葉片顏色與氣泡數量。第三天改變光照強度後，再比較各組結果。"
  long_stem=("甲同學先準備三組相同植株，並控制水量與溫度。研究開始前，所有植株均放置在相同大小的容器中。"
             +article+"研究人員也記錄環境濕度與二氧化碳濃度，避免其他條件影響結果。"
             "最後將每日資料整理成表格，再請依上述資料判斷何者正確。")
  self.assertIn("passage_content_in_stem",rules({"題型":"選擇題","題組文章":article,"題目":article+"\n(A)甲\n(B)乙\n(C)丙\n(D)丁","答案":"A"}))
  data={"卷":[{"題號":"1","題型":"passage","題目":article,"答案":"文章"},{"題號":"2","題型":"選擇題","題目":article+"\n(A)甲\n(B)乙\n(C)丙\n(D)丁","答案":"A"}]}
  self.assertIn("passage_content_in_stem",{f["rule"] for f in check_data(data)["papers"][0]["questions"][1]["flags"]})
if __name__=="__main__": unittest.main()
