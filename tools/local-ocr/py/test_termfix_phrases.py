import os, sys, unittest
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import termfix

class PhraseFixTest(unittest.TestCase):
    NEW_FIXES = [
        ("慣性定侓", "慣性定律"), ("牛頓定侓", "牛頓定律"), ("質里", "質量"),
        ("體枳", "體積"), ("密渡", "密度"), ("溫渡", "溫度"), ("熱里", "熱量"),
        ("壓カ", "壓力"), ("電沮", "電阻"), ("電流強渡", "電流強度"),
        ("電功卒", "電功率"), ("焦尒", "焦耳"), ("瓦持", "瓦特"), ("赫滋", "赫茲"),
        ("攝氐", "攝氏"), ("公尅", "公克"), ("平方公汾", "平方公分"),
        ("立方公汾", "立方公分"),
        ("每杪", "每秒"), ("速渡", "速度"), ("加速渡", "加速度"), ("位侈", "位移"),
        ("摩擦カ", "摩擦力"), ("浮カ", "浮力"), ("彈カ", "彈力"), ("原于", "原子"),
        ("分于", "分子"), ("離于", "離子"), ("質于", "質子"), ("中于", "中子"),
        ("電子犀", "電子層"), ("化學反庶", "化學反應"), ("化學武", "化學式"),
        ("氫氧化納", "氫氧化鈉"), ("氯化納", "氯化鈉"), ("硫酸桐", "硫酸銅"),
        ("細胞莫", "細胞膜"), ("細胞該", "細胞核"),
        ("葉綠休", "葉綠體"), ("粒線休", "粒線體"), ("染色休", "染色體"),
        ("光合作甩", "光合作用"), ("呼吸侔用", "呼吸作用"), ("消化糸統", "消化系統"),
        ("循環糸統", "循環系統"), ("神經糸統", "神經系統"), ("生態糸統", "生態系統"),
        ("地売", "地殼"), ("岩獎", "岩漿"), ("板瑰", "板塊"), ("震夬", "震央"),
        ("經緯渡", "經緯度"), ("大氣犀", "大氣層"), ("對流犀", "對流層"),
        ("平流犀", "平流層"), ("自轉柚", "自轉軸"), ("公轉週其", "公轉週期"),
        ("地軸頃斜", "地軸傾斜"), ("太陽糸", "太陽系"),
    ]

    def test_known_ocr_errors_are_fixed(self):
        self.assertEqual(termfix.fix_text("忽略空氣沮力，上升和下譯過程"), "忽略空氣阻力，上升和下降過程")
        self.assertEqual(termfix.fix_text("三個木瑰"), "三個木塊")
        self.assertEqual(termfix.fix_text("母秒的速度變花成等比列"), "每秒的速度變化成等比數列")
        self.assertEqual(termfix.fix_text("(C)與在地面上所量的相同司"), "(C)與在地面上所量的相同")

    def test_correct_text_is_untouched(self):
        for t in ["空氣阻力", "上升和下降", "木塊", "每秒", "等比數列", "沮喪"]:
            self.assertEqual(termfix.fix_text(t), t)

    def test_new_ocr_errors_are_fixed(self):
        for wrong, right in self.NEW_FIXES:
            with self.subTest(wrong=wrong):
                self.assertEqual(termfix.fix_text(wrong), right)

    def test_new_correct_terms_are_untouched(self):
        for _, right in self.NEW_FIXES:
            with self.subTest(right=right):
                self.assertEqual(termfix.fix_text(right), right)

    def test_can_be_disabled(self):
        os.environ["TERMFIX"] = "0"
        try:
            self.assertEqual(termfix.fix_text("沮力"), "沮力")
        finally:
            del os.environ["TERMFIX"]

if __name__ == "__main__":
    unittest.main()
