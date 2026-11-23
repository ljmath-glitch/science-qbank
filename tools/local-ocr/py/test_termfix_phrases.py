import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import termfix

class PhraseFixTest(unittest.TestCase):
    def test_known_ocr_errors_are_fixed(self):
        self.assertEqual(termfix.fix_text("忽略空氣沮力，上升和下譯過程"), "忽略空氣阻力，上升和下降過程")
        self.assertEqual(termfix.fix_text("三個木瑰"), "三個木塊")
        self.assertEqual(termfix.fix_text("母秒的速度變花成等比列"), "每秒的速度變化成等比數列")
        self.assertEqual(termfix.fix_text("(C)與在地面上所量的相同司"), "(C)與在地面上所量的相同")

    def test_correct_text_is_untouched(self):
        for t in ["空氣阻力", "上升和下降", "木塊", "每秒", "等比數列", "沮喪"]:
            self.assertEqual(termfix.fix_text(t), t)

    def test_can_be_disabled(self):
        os.environ["TERMFIX"] = "0"
        try:
            self.assertEqual(termfix.fix_text("沮力"), "沮力")
        finally:
            del os.environ["TERMFIX"]

if __name__ == "__main__":
    unittest.main()
