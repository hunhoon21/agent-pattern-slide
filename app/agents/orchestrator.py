import asyncio
import json

from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent

from app.prompts.orchestrator_prompts import (
    ORCHESTRATOR_SYSTEM_PROMPT,
    WORKER_SYSTEM_PROMPT,
    SYNTHESIZER_SYSTEM_PROMPT,
)
from app.utils.sse import sse_token, sse_step, sse_done, sse_error, make_step, extract_usage
from app.utils.log_utils import log_step

MODEL = "gpt-4o-mini"

orchestrator_agent = Agent(name="orchestrator", instructions=ORCHESTRATOR_SYSTEM_PROMPT, model=MODEL)
worker_agent = Agent(name="worker", instructions=WORKER_SYSTEM_PROMPT, model=MODEL)
synthesizer_agent = Agent(name="synthesizer", instructions=SYNTHESIZER_SYSTEM_PROMPT, model=MODEL)


async def run_orchestrator_stream(task: str):
    """Async generator yielding SSE events for the orchestrator-worker pattern."""

    # Phase 1: Planning (non-streamed, need structured JSON)
    plan_result = await Runner.run(orchestrator_agent, input=task)
    plan_content = plan_result.final_output

    subtasks = _parse_subtasks(plan_content)
    if subtasks is None:
        # Retry once with stronger instruction
        plan_result = await Runner.run(
            orchestrator_agent, input=task + "\nYou MUST output valid JSON."
        )
        plan_content = plan_result.final_output
        subtasks = _parse_subtasks(plan_content)
        if subtasks is None:
            yield sse_error("Failed to parse orchestrator plan as JSON")
            yield sse_done()
            return

    usage = extract_usage(plan_result)
    planning_step = make_step("planning", "orchestrator", plan_content, usage, subtasks=subtasks)
    log_step(planning_step)
    yield sse_step(planning_step)

    # Phase 2: Workers in parallel
    for i in range(len(subtasks)):
        start_step = make_step("worker_start", "worker", "", worker_id=i)
        log_step(start_step)
        yield sse_step(start_step)

    event_queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run_worker(worker_id: int, subtask: dict) -> str:
        worker_input = (
            f"Subtask: {subtask['title']}\n\n"
            f"{subtask.get('description', '')}\n\n"
            f"Approach: {subtask.get('approach', '')}"
        )
        collected: list[str] = []
        result = Runner.run_streamed(worker_agent, input=worker_input)

        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                await event_queue.put(sse_token("worker", delta, worker_id=worker_id))

        content = "".join(collected)
        w_usage = extract_usage(result)
        complete_step = make_step("worker_complete", "worker", content, w_usage, worker_id=worker_id)
        log_step(complete_step)
        await event_queue.put(sse_step(complete_step))
        return content

    worker_tasks = [
        asyncio.create_task(run_worker(i, subtasks[i])) for i in range(len(subtasks))
    ]

    async def signal_done():
        await asyncio.gather(*worker_tasks)
        await event_queue.put(None)

    asyncio.create_task(signal_done())

    while True:
        event = await event_queue.get()
        if event is None:
            break
        yield event

    worker_outputs = [t.result() for t in worker_tasks]

    # Phase 3: Synthesis
    synth_start = make_step("synthesizing", "synthesizer", "")
    log_step(synth_start)
    yield sse_step(synth_start)

    worker_text = "\n\n".join(
        f"[Worker {i + 1}: {subtasks[i]['title']}]\n{output}"
        for i, output in enumerate(worker_outputs)
    )
    synth_input = f"Original task: {task}\n\nWorker outputs:\n{worker_text}"
    collected: list[str] = []
    result = Runner.run_streamed(synthesizer_agent, input=synth_input)

    async for event in result.stream_events():
        if event.type == "raw_response_event" and isinstance(
            event.data, ResponseTextDeltaEvent
        ):
            delta = event.data.delta
            collected.append(delta)
            yield sse_token("synthesizer", delta)

    synth_content = "".join(collected)
    s_usage = extract_usage(result)
    final_step = make_step("final", "synthesizer", synth_content, s_usage)
    log_step(final_step)
    yield sse_step(final_step)

    yield sse_done()


def _parse_subtasks(content: str) -> list | None:
    try:
        parsed = json.loads(content)
        if isinstance(parsed, list):
            return parsed
        if "subtasks" in parsed:
            return parsed["subtasks"]
        for v in parsed.values():
            if isinstance(v, list):
                return v
    except (json.JSONDecodeError, AttributeError):
        pass
    return None
