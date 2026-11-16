# ch10-python — 매출 보고서 도우미

책 10장 예제입니다. 지점별 매출 파일(엑셀·CSV)을 합쳐 월별 집계 보고서를 만드는 Python(pandas) 스크립트에 Electron 화면을 입힙니다.

## 준비

Python 쪽은 [uv](https://docs.astral.sh/uv/)로 가상 환경을 만듭니다.

```bash
cd python
uv sync                        # .venv 생성, pandas·openpyxl 설치
uv run sales_report.py ../samples 보고서.xlsx   # 스크립트 단독 실행 확인
cd ..
npm install
npm start
```

이미 pandas·openpyxl이 설치된 Python을 쓰려면 `uv sync` 대신 환경 변수 `SALES_PYTHON`에 그 python 실행 파일 경로를 넣고 `npm start`를 실행합니다.

## 구성

| 경로                     | 내용                                                                             |
| ------------------------ | -------------------------------------------------------------------------------- |
| `python/sales_report.py` | 원래 있던 스크립트. 명령줄에서 단독으로 실행된다                                 |
| `python/worker.py`       | Electron과 표준 입출력(JSON Lines)으로 대화하는 작업자                           |
| `python/make_samples.py` | 샘플 매출 파일 생성기                                                            |
| `src/python-host.ts`     | Python 관리자 (UtilityProcess). 작업자를 관리하고 화면과 MessagePort로 직접 통신 |
| `src/host/python.ts`     | Python 작업자 실행·요청·취소·종료 관리                                           |
| `src/main/report.ts`     | 관리자 실행·재시작, 창과 관리자 연결, 폴더·저장 대화상자                         |
| `src/preload.ts`         | 관리자와 연결된 MessagePort를 보관하고 함수만 화면에 노출                        |
| `samples/`               | 샘플 매출 파일 (엑셀 5, CP949 CSV 1, 열이 빠진 파일 1)                           |

## 검증

```bash
npm test
npm run typecheck
npm run lint
npm run check:security
```
