import os

from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware

from app.agents.reflection import run_reflection_stream
from app.agents.orchestrator import run_orchestrator_stream
from app.utils.sse import sse_error, sse_done

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
async def health():
    return {"status": "ok", "hasApiKey": bool(os.getenv("OPENAI_API_KEY"))}


@app.post("/api/reflection")
async def reflection_endpoint(request: Request):
    body = await request.json()
    task = body.get("task", "")
    if not task or not isinstance(task, str) or len(task) > 500:
        return JSONResponse({"error": "Task is required (max 500 chars)"}, status_code=400)

    async def event_stream():
        try:
            async for event in run_reflection_stream(task):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as e:
            yield sse_error(str(e))
            yield sse_done()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


@app.post("/api/orchestrator")
async def orchestrator_endpoint(request: Request):
    body = await request.json()
    task = body.get("task", "")
    if not task or not isinstance(task, str) or len(task) > 500:
        return JSONResponse({"error": "Task is required (max 500 chars)"}, status_code=400)

    async def event_stream():
        try:
            async for event in run_orchestrator_stream(task):
                if await request.is_disconnected():
                    break
                yield event
        except Exception as e:
            yield sse_error(str(e))
            yield sse_done()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive"},
    )


# Mount static files only in local development (Vercel serves them via CDN)
if not os.getenv("VERCEL"):
    app.mount("/", StaticFiles(directory="public", html=True), name="static")
