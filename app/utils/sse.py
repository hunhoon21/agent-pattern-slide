import json
from datetime import datetime, timezone


def sse_token(
    agent: str,
    delta: str,
    iteration: int | None = None,
    worker_id: int | None = None,
) -> str:
    event = {"type": "token", "agent": agent, "delta": delta}
    if iteration is not None:
        event["iteration"] = iteration
    if worker_id is not None:
        event["workerId"] = worker_id
    return f"data: {json.dumps(event, ensure_ascii=False)}\n\n"


def sse_step(step: dict) -> str:
    return f"data: {json.dumps({'type': 'step', 'step': step}, ensure_ascii=False)}\n\n"


def sse_error(message: str) -> str:
    return f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"


def sse_done() -> str:
    return "data: [DONE]\n\n"


def make_step(
    step_type: str,
    agent: str,
    content: str,
    token_usage: dict | None = None,
    iteration: int | None = None,
    worker_id: int | None = None,
    subtasks: list | None = None,
) -> dict:
    step: dict = {
        "type": step_type,
        "agent": agent,
        "content": content,
        "tokenUsage": token_usage or {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    if iteration is not None:
        step["iteration"] = iteration
    if worker_id is not None:
        step["workerId"] = worker_id
    if subtasks is not None:
        step["subtasks"] = subtasks
    return step


def extract_usage(result) -> dict:
    """Extract token usage from a RunResult or RunResultStreaming object.

    The Agents SDK uses input_tokens/output_tokens; the frontend expects
    prompt_tokens/completion_tokens. This helper maps between them.
    """
    usage = {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    try:
        if result.raw_responses:
            last = result.raw_responses[-1]
            if hasattr(last, "usage") and last.usage:
                inp = getattr(last.usage, "input_tokens", 0) or 0
                out = getattr(last.usage, "output_tokens", 0) or 0
                usage = {
                    "prompt_tokens": inp,
                    "completion_tokens": out,
                    "total_tokens": inp + out,
                }
    except Exception:
        pass
    return usage
