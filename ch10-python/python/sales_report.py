"""지점별 매출 파일(엑셀·CSV)을 합쳐 월별 집계 보고서(엑셀)를 만든다.

Electron 앱과 상관없이 명령줄에서 단독으로 실행할 수 있다.
    python sales_report.py 입력폴더 보고서.xlsx

앱에서 쓰려고 바꾼 것은 build_report()의 인자 두 개(on_progress, should_cancel)뿐이다.
"""

import sys
from pathlib import Path

import pandas as pd

REQUIRED = ["일자", "지점", "품목", "수량", "단가"]


class ReportCancelled(Exception):
    """사용자가 작업을 취소했다."""


def find_files(folder: Path) -> list[Path]:
    files = [p for p in folder.iterdir() if p.suffix.lower() in (".xlsx", ".csv")]
    # 엑셀이 열어 둔 파일의 잠금 파일(~$이름.xlsx)은 건너뛴다
    return sorted(p for p in files if not p.name.startswith("~$"))


def read_csv(path: Path) -> pd.DataFrame:
    # 엑셀에서 "CSV"로 저장한 한국어 파일은 CP949인 경우가 많다
    try:
        return pd.read_csv(path, encoding="utf-8-sig")
    except UnicodeDecodeError:
        return pd.read_csv(path, encoding="cp949")


def read_one(path: Path) -> pd.DataFrame:
    df = read_csv(path) if path.suffix.lower() == ".csv" else pd.read_excel(path)
    missing = [c for c in REQUIRED if c not in df.columns]
    if missing:
        raise ValueError(f"필수 열이 없습니다: {', '.join(missing)}")
    return df[REQUIRED]


def build_report(input_dir, output, on_progress=None, should_cancel=None) -> dict:
    input_dir, output = Path(input_dir), Path(output)
    files = find_files(input_dir)
    if not files:
        raise ValueError("폴더에 엑셀(.xlsx)이나 CSV 파일이 없습니다.")

    frames, errors = [], []
    for i, path in enumerate(files, start=1):
        if should_cancel and should_cancel():
            raise ReportCancelled()
        print(f"읽는 중: {path.name}")  # 원래 스크립트에 있던 진행 표시
        try:
            frames.append(read_one(path))
        except Exception as e:  # 파일 하나가 잘못돼도 나머지는 계속 집계한다
            errors.append({"file": path.name, "message": str(e)})
        if on_progress:
            on_progress(i, len(files), path.name)

    if not frames:
        raise ValueError("집계할 수 있는 파일이 없습니다.")

    data = pd.concat(frames, ignore_index=True)
    data["매출"] = data["수량"] * data["단가"]
    data["월"] = pd.to_datetime(data["일자"]).dt.strftime("%Y-%m")
    by_month = data.pivot_table(
        index="월", columns="지점", values="매출", aggfunc="sum", fill_value=0
    )
    by_item = (
        data.groupby("품목")[["수량", "매출"]].sum().sort_values("매출", ascending=False)
    )

    # 쓰는 도중에 멈춰도 기존 보고서가 깨지지 않게 임시 파일에 쓴 뒤 바꿔치기한다
    tmp = output.with_name(output.name + ".tmp")
    with pd.ExcelWriter(tmp, engine="openpyxl") as writer:
        by_month.to_excel(writer, sheet_name="월별-지점별")
        by_item.to_excel(writer, sheet_name="품목별")
        if errors:
            pd.DataFrame(errors).to_excel(writer, sheet_name="제외한 파일", index=False)
    tmp.replace(output)

    return {
        "output": str(output),
        "files": len(files),
        "rows": len(data),
        "total": int(data["매출"].sum()),
        "months": list(by_month.index),
        "branches": list(by_month.columns),
        "byMonth": [[m, *map(int, row)] for m, row in zip(by_month.index, by_month.values)],
        "errors": errors,
    }


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        print("사용법: python sales_report.py 입력폴더 보고서.xlsx")
        return 2
    result = build_report(argv[1], argv[2])
    print(f"완료: {result['files']}개 파일, {result['rows']}행, 제외 {len(result['errors'])}건")
    print(f"보고서: {result['output']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
