"""sales_report.py 단위 테스트.  실행: uv run python -m unittest -v"""

import tempfile
import unittest
from pathlib import Path

import pandas as pd

import sales_report

ROWS = [
    {"일자": "2026-09-01", "지점": "서울", "품목": "노트", "수량": 2, "단가": 1000},
    {"일자": "2026-10-05", "지점": "서울", "품목": "펜", "수량": 1, "단가": 500},
]


class BuildReportTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.dir = Path(self.tmp.name)
        self.out = self.dir / "out" / "보고서.xlsx"
        self.out.parent.mkdir()

    def tearDown(self):
        self.tmp.cleanup()

    def test_엑셀과_CP949_CSV를_합친다(self):
        pd.DataFrame(ROWS).to_excel(self.dir / "a.xlsx", index=False)
        pd.DataFrame(ROWS).to_csv(self.dir / "b.csv", index=False, encoding="cp949")
        r = sales_report.build_report(self.dir, self.out)
        self.assertEqual(r["files"], 2)
        self.assertEqual(r["rows"], 4)
        self.assertEqual(r["total"], (2000 + 500) * 2)
        self.assertEqual(r["months"], ["2026-09", "2026-10"])
        self.assertTrue(self.out.exists())

    def test_열이_빠진_파일은_제외하고_계속한다(self):
        pd.DataFrame(ROWS).to_excel(self.dir / "a.xlsx", index=False)
        pd.DataFrame(ROWS).drop(columns=["단가"]).to_excel(self.dir / "b.xlsx", index=False)
        r = sales_report.build_report(self.dir, self.out)
        self.assertEqual(r["rows"], 2)
        self.assertEqual(r["errors"], [{"file": "b.xlsx", "message": "필수 열이 없습니다: 단가"}])

    def test_엑셀_잠금_파일은_건너뛴다(self):
        pd.DataFrame(ROWS).to_excel(self.dir / "a.xlsx", index=False)
        (self.dir / "~$a.xlsx").write_bytes(b"lock")
        self.assertEqual(sales_report.build_report(self.dir, self.out)["files"], 1)

    def test_취소하면_보고서를_만들지_않는다(self):
        pd.DataFrame(ROWS).to_excel(self.dir / "a.xlsx", index=False)
        with self.assertRaises(sales_report.ReportCancelled):
            sales_report.build_report(self.dir, self.out, should_cancel=lambda: True)
        self.assertFalse(self.out.exists())
        self.assertEqual(list(self.out.parent.iterdir()), [])  # 임시 파일도 없다

    def test_진행률을_파일마다_알린다(self):
        for name in ("a.xlsx", "b.xlsx"):
            pd.DataFrame(ROWS).to_excel(self.dir / name, index=False)
        seen = []
        sales_report.build_report(self.dir, self.out, on_progress=lambda d, t, f: seen.append((d, t, f)))
        self.assertEqual(seen, [(1, 2, "a.xlsx"), (2, 2, "b.xlsx")])

    def test_파일이_없으면_오류(self):
        with self.assertRaisesRegex(ValueError, "파일이 없습니다"):
            sales_report.build_report(self.dir, self.out)


if __name__ == "__main__":
    unittest.main()
