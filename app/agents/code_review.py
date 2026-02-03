import asyncio
import json

from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent

from app.prompts.code_review_prompts import (
    CORRECTNESS_REVIEWER_PROMPT,
    STYLE_REVIEWER_PROMPT,
    PERFORMANCE_REVIEWER_PROMPT,
    SECURITY_REVIEWER_PROMPT,
    REVIEW_SUMMARIZER_PROMPT,
)
from app.utils.sse import sse_token, sse_step, sse_done, sse_error, make_step, extract_usage
from app.utils.log_utils import log_step

MODEL = "gpt-4o-mini"

correctness_reviewer_agent = Agent(
    name="correctness_reviewer", instructions=CORRECTNESS_REVIEWER_PROMPT, model=MODEL
)
style_reviewer_agent = Agent(name="style_reviewer", instructions=STYLE_REVIEWER_PROMPT, model=MODEL)
performance_reviewer_agent = Agent(
    name="performance_reviewer", instructions=PERFORMANCE_REVIEWER_PROMPT, model=MODEL
)
security_reviewer_agent = Agent(
    name="security_reviewer", instructions=SECURITY_REVIEWER_PROMPT, model=MODEL
)
summarizer_agent = Agent(name="summarizer", instructions=REVIEW_SUMMARIZER_PROMPT, model=MODEL)


async def run_code_review_stream(code: str):
    """Async generator yielding SSE events for the code review pattern."""

    # Phase 1: Start review
    start_step = make_step("review_start", "code_review", "Starting code review with 4 specialized reviewers")
    log_step(start_step)
    yield sse_step(start_step)

    # Phase 2: Run 4 reviewers in parallel
    categories = ["correctness", "style", "performance", "security"]
    agents = [
        correctness_reviewer_agent,
        style_reviewer_agent,
        performance_reviewer_agent,
        security_reviewer_agent,
    ]

    for category in categories:
        category_start_step = make_step("review_category", category, "", category=category)
        log_step(category_start_step)
        yield sse_step(category_start_step)

    event_queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def run_reviewer(category: str, agent: Agent) -> tuple[str, str]:
        reviewer_input = f"Review the following code:\n\n```\n{code}\n```"
        collected: list[str] = []
        result = Runner.run_streamed(agent, input=reviewer_input)

        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                await event_queue.put(sse_token(category, delta, category=category))

        content = "".join(collected)
        r_usage = extract_usage(result)
        complete_step = make_step("review_complete", category, content, r_usage, category=category)
        log_step(complete_step)
        await event_queue.put(sse_step(complete_step))
        return category, content

    reviewer_tasks = [
        asyncio.create_task(run_reviewer(categories[i], agents[i])) for i in range(len(categories))
    ]

    async def signal_done():
        await asyncio.gather(*reviewer_tasks)
        await event_queue.put(None)

    asyncio.create_task(signal_done())

    while True:
        event = await event_queue.get()
        if event is None:
            break
        yield event

    reviewer_outputs = {category: content for category, content in [t.result() for t in reviewer_tasks]}

    # Phase 3: Synthesis
    summary_start = make_step("summary", "summarizer", "")
    log_step(summary_start)
    yield sse_step(summary_start)

    review_text = "\n\n".join(
        f"[{category.upper()} REVIEW]\n{reviewer_outputs[category]}"
        for category in categories
    )
    synth_input = f"Code under review:\n```\n{code}\n```\n\nReviews:\n{review_text}"
    collected: list[str] = []
    result = Runner.run_streamed(summarizer_agent, input=synth_input)

    async for event in result.stream_events():
        if event.type == "raw_response_event" and isinstance(
            event.data, ResponseTextDeltaEvent
        ):
            delta = event.data.delta
            collected.append(delta)
            yield sse_token("summarizer", delta)

    synth_content = "".join(collected)
    s_usage = extract_usage(result)
    final_step = make_step("final", "summarizer", synth_content, s_usage)
    log_step(final_step)
    yield sse_step(final_step)

    yield sse_done()
