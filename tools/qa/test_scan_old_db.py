import unittest

from scan_old_db import scan


class ScanOldDbTest(unittest.TestCase):
    def test_passage_image_and_overlap(self):
        rows = [
            {"id": "p1", "exam": "卷甲", "type": "passage", "group_id": "g", "q": "如下圖資料", "no": "", "ans": ""},
            {"id": "q1", "exam": "卷甲", "type": "選擇題", "group_id": "g", "q": "依文章回答\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "no": "1", "ans": "A", "chart": "無", "flag": True, "basis": ""},
            {"id": "q2", "exam": "卷甲", "type": "選擇題", "group_id": "", "q": "如圖所示\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "no": "2", "ans": "B", "chart": "無", "flag": False, "basis": "[回報] 缺圖"},
        ]
        report = scan(rows, {"p1"})
        exam = report["exams"][0]
        self.assertTrue(exam["questions"][0]["has_image"])
        self.assertEqual(exam["questions"][0]["severity"], "pass")
        self.assertIn("missing_image", {f["rule"] for f in exam["questions"][1]["flags"]})
        self.assertEqual(report["overlap_flag_report"], {"caught": 1, "total": 2})

    def test_chart_metadata_requires_image(self):
        rows = [{"id": "q", "exam": "卷", "type": "選擇題", "group_id": "", "q": "題目\n(A)甲\n(B)乙\n(C)丙\n(D)丁", "no": "1", "ans": "A", "chart": "表格", "flag": False, "basis": ""}]
        report = scan(rows, set())
        self.assertEqual(report["exams"][0]["summary"]["missing_image"], 1)


if __name__ == "__main__": unittest.main()
