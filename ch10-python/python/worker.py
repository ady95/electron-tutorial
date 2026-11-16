"""Electron과 표준 입출력으로 대화하는 작업자.

한 줄에 JSON 하나(JSON Lines)를 주고받는다.
  받는 것: {"id": 1, "method": "report", "params": {...}}
           {"id": 1, "method": "cancel"}                      # 1번 작업 취소
  보내는 것: {"id": 1, "type": "progress", "done": 3, "total": 7, "file": "..."}
           {"id": 1, "type": "result", "result": {...}}
           {"id": 1, "type": "error", "code": "...", "message": "..."}
표준 입력이 닫히면(앱이 종료되면) 작업자도 끝난다.
"""

import json
import platform
import queue
import sys
import threading
import time

STARTED = time.perf_counter()

# 프로토콜은 바이트로 직접 쓴다. 콘솔 인코딩(CP949 등)과 버퍼링 설정에 영향을 받지 않는다
_protocol = sys.stdout.buffer
# 스크립트와 라이브러리의 print는 stderr(로그)로 보낸다. 표준 출력에는 프로토콜만 흐르게 한다
sys.stdout = sys.stderr

import pandas as pd  # noqa: E402  (불러오는 시간을 재려고 STARTED 뒤에 둔다)

import sales_report  # noqa: E402

_lock = threading.Lock()


def send(message: dict) -> None:
    line = json.dumps(message, ensure_ascii=False) + "\n"
    with _lock:  # 진행률(작업 스레드)과 응답이 한 줄 안에서 섞이지 않게
        _protocol.write(line.encode("utf-8"))
        _protocol.flush()


cancelled: set[int] = set()
jobs: "queue.Queue[dict | None]" = queue.Queue()


def run(job: dict) -> None:
    job_id, method, params = job["id"], job.get("method"), job.get("params") or {}
    try:
        if method == "hello":
            result = {
                "python": platform.python_version(),
                "pandas": pd.__version__,
                "startupMs": round((time.perf_counter() - STARTED) * 1000),
            }
        elif method == "report":
            result = sales_report.build_report(
                params["inputDir"],
                params["output"],
                on_progress=lambda done, total, name: send(
                    {"id": job_id, "type": "progress", "done": done, "total": total, "file": name}
                ),
                should_cancel=lambda: job_id in cancelled,
            )
        else:
            raise ValueError(f"알 수 없는 요청: {method}")
        send({"id": job_id, "type": "result", "result": result})
    except sales_report.ReportCancelled:
        send({"id": job_id, "type": "error", "code": "cancelled", "message": "취소했습니다."})
    except Exception as e:
        send({"id": job_id, "type": "error", "code": type(e).__name__, "message": str(e)})
    finally:
        cancelled.discard(job_id)


def work_loop() -> None:
    while (job := jobs.get()) is not None:
        run(job)


def main() -> None:
    worker = threading.Thread(target=work_loop, daemon=True)
    worker.start()
    # 표준 입력은 이 스레드가 계속 읽는다. 작업 중에도 취소 요청을 받을 수 있다
    for raw in sys.stdin.buffer:
        try:
            msg = json.loads(raw.decode("utf-8"))
        except ValueError:
            continue  # 잘못된 줄은 무시한다
        if msg.get("method") == "cancel":
            cancelled.add(msg.get("id"))
        else:
            jobs.put(msg)
    # 표준 입력이 닫혔다 = 앱이 끝났거나 연결이 끊겼다
    jobs.put(None)
    worker.join(timeout=5)


if __name__ == "__main__":
    main()
