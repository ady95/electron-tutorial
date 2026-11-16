"""10-3 비교용: 같은 작업을 로컬 HTTP 서버(FastAPI)로 제공한다.

- 127.0.0.1에만, 운영체제가 고른 빈 포트(0번)로 연다. 고른 포트는 표준 출력 첫 줄로 알린다
- 모든 요청에 앱이 실행할 때 넘겨준 토큰(SALES_TOKEN)이 있어야 한다
- 표준 입력이 닫히면(앱이 끝나면) 서버도 끝난다
"""

import asyncio
import json
import os
import platform
import secrets
import socket
import sys
import threading
import time

STARTED = time.perf_counter()
_protocol = sys.stdout.buffer
sys.stdout = sys.stderr

import pandas as pd  # noqa: E402
import uvicorn  # noqa: E402
from fastapi import Depends, FastAPI, HTTPException, Request  # noqa: E402
from fastapi.middleware.trustedhost import TrustedHostMiddleware  # noqa: E402
from fastapi.responses import StreamingResponse  # noqa: E402
from pydantic import BaseModel  # noqa: E402

import sales_report  # noqa: E402

TOKEN = os.environ.get("SALES_TOKEN", "")

app = FastAPI(docs_url=None, redoc_url=None, openapi_url=None)
# Host 헤더가 127.0.0.1이 아닌 요청은 거부한다 (DNS 리바인딩 공격 방지)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1"])


def check_token(request: Request) -> None:
    sent = request.headers.get("authorization", "")
    if not TOKEN or not secrets.compare_digest(sent, f"Bearer {TOKEN}"):
        raise HTTPException(status_code=401, detail="토큰이 없거나 틀렸습니다.")


@app.get("/hello", dependencies=[Depends(check_token)])
def hello() -> dict:
    return {
        "python": platform.python_version(),
        "pandas": pd.__version__,
        "startupMs": round((time.perf_counter() - STARTED) * 1000),
    }


class ReportRequest(BaseModel):
    inputDir: str
    output: str


@app.post("/report", dependencies=[Depends(check_token)])
async def report(body: ReportRequest, request: Request) -> StreamingResponse:
    """진행률과 결과를 한 줄에 JSON 하나(NDJSON)로 흘려보낸다. 연결이 끊기면 작업을 취소한다."""
    loop = asyncio.get_running_loop()
    events: asyncio.Queue = asyncio.Queue()
    cancelled = threading.Event()

    def emit(m: dict) -> None:
        loop.call_soon_threadsafe(events.put_nowait, m)

    def work() -> None:
        try:
            result = sales_report.build_report(
                body.inputDir,
                body.output,
                on_progress=lambda d, t, f: emit({"type": "progress", "done": d, "total": t, "file": f}),
                should_cancel=cancelled.is_set,
            )
            emit({"type": "result", "result": result})
        except sales_report.ReportCancelled:
            emit({"type": "error", "code": "cancelled", "message": "취소했습니다."})
        except Exception as e:
            emit({"type": "error", "code": type(e).__name__, "message": str(e)})

    threading.Thread(target=work, daemon=True).start()

    async def stream():
        try:
            while True:
                m = await events.get()
                yield (json.dumps(m, ensure_ascii=False) + "\n").encode("utf-8")
                if m["type"] != "progress":
                    break
        finally:
            cancelled.set()  # 클라이언트가 연결을 끊으면(취소) 여기로 온다

    return StreamingResponse(stream(), media_type="application/x-ndjson")


def exit_when_stdin_closes() -> None:
    sys.stdin.buffer.read()  # 앱이 끝나 표준 입력이 닫힐 때까지 기다린다
    os._exit(0)


def main() -> None:
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("127.0.0.1", 0))  # 0번 = 운영체제가 빈 포트를 고른다
    port = sock.getsockname()[1]
    sock.listen()  # 서버가 다 뜨기 전에 온 연결은 대기열에서 기다리게 한다
    if "--no-stdin-watch" not in sys.argv:
        threading.Thread(target=exit_when_stdin_closes, daemon=True).start()
    _protocol.write((json.dumps({"port": port}) + "\n").encode())
    _protocol.flush()
    config = uvicorn.Config(app, log_level="warning")
    uvicorn.Server(config).run(sockets=[sock])


if __name__ == "__main__":
    main()
