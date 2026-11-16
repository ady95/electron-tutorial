"""실습용 매출 파일을 만든다.

    python make_samples.py ../samples          # 엑셀 5개, CP949 CSV 1개, 열이 빠진 엑셀 1개, 텍스트 1개
    python make_samples.py 폴더 --many 200      # 진행률·취소 확인용 파일 200개
"""

import random
import sys
from datetime import date, timedelta
from pathlib import Path

import pandas as pd

ITEMS = {"노트 A5": 3500, "노트 B5": 4200, "만년 다이어리": 15000, "볼펜 세트": 6000, "포스트잇": 1800}
BRANCHES = ["서울-강남", "서울-홍대", "부산-서면", "대구-동성로", "광주-충장로", "인천-송도", "대전-둔산"]


def rows(branch: str, n: int, seed: int) -> pd.DataFrame:
    rnd = random.Random(seed)
    start = date(2026, 9, 1)
    data = []
    for _ in range(n):
        item = rnd.choice(list(ITEMS))
        data.append(
            {
                "일자": (start + timedelta(days=rnd.randrange(91))).isoformat(),
                "지점": branch,
                "품목": item,
                "수량": rnd.randint(1, 20),
                "단가": ITEMS[item],
            }
        )
    return pd.DataFrame(data)


def main(argv: list[str]) -> None:
    out = Path(argv[1])
    out.mkdir(parents=True, exist_ok=True)
    if "--many" in argv:
        count = int(argv[argv.index("--many") + 1])
        for i in range(count):
            branch = BRANCHES[i % len(BRANCHES)]
            rows(branch, 300, i).to_excel(out / f"{i:03d}-{branch}.xlsx", index=False)
        return

    for i, branch in enumerate(BRANCHES[:5]):
        rows(branch, 300, i).to_excel(out / f"{branch}.xlsx", index=False)
    # 엑셀에서 "CSV"로 저장한 것처럼 CP949로 쓴다
    rows(BRANCHES[5], 300, 5).to_csv(out / f"{BRANCHES[5]}.csv", index=False, encoding="cp949")
    # 단가 열이 빠진 잘못된 파일
    rows(BRANCHES[6], 50, 6).drop(columns=["단가"]).to_excel(out / f"{BRANCHES[6]}.xlsx", index=False)
    (out / "읽어 주세요.txt").write_text("집계 대상이 아닌 파일\n", encoding="utf-8")


if __name__ == "__main__":
    main(sys.argv)
