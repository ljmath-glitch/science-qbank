import unittest

from quality_gate import check_data, check_question, check_numbering


def rules(question):
    return {flag["rule"] for flag in check_question(question)}


class QualityGateTest(unittest.TestCase):
    def test_missing_image_and_blank_options(self):
        found = rules({"題目": "如附圖所示，何者正確？\n(A)\n(B)\n(C)\n(D)", "答案": "A", "圖表類型": "無"})
        self.assertIn("missing_image", found)
        self.assertIn("incomplete_options", found)

    def test_true_false_only_needs_two_options(self):
        found = rules({"題目": "下列敘述？\n(A)正確\n(B)錯誤", "答案": "B", "圖表類型": "無"})
        self.assertNotIn("incomplete_options", found)

    def test_answer_and_group_article_blocks(self):
        found = rules({"題目": "題幹\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "答案": "E", "題組ID": "g1"})
        self.assertIn("answer_out_of_range", found)
        self.assertIn("missing_group_article", found)

    def test_noise_and_flattened_notation(self):
        found = rules({"題目": "(7-2) $3\\times1020$，面積 0.2 cm2。I5\\mathrm{(C)x}$ 試題結束\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "答案": "A"})
        self.assertTrue({"page_label_noise", "exam_end_noise", "flattened_exponent", "flattened_square_unit", "flattened_subscript", "latex_option_label"} <= found)

    def test_numbering_detects_gap_and_duplicate(self):
        issues = check_numbering([{"題號": "1"}, {"題號": "3"}, {"題號": "3"}])
        flat = {flag["rule"] for flags in issues.values() for flag in flags}
        self.assertIn("missing_question_number", flat)
        self.assertIn("duplicate_question_number", flat)

    def test_report_has_per_paper_summary(self):
        report = check_data({"測驗": [{"題號": "1", "題目": "題幹\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "答案": "A"}]})
        self.assertEqual(report["papers"][0]["summary"]["通過數"], 1)
        self.assertEqual(report["papers"][0]["questions"][0]["severity"], "pass")


if __name__ == "__main__":
    unittest.main()
