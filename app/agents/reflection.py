from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent

from app.prompts.reflection_prompts import (
    GENERATOR_SYSTEM_PROMPT,
    CRITIC_SYSTEM_PROMPT,
    REFINER_SYSTEM_PROMPT,
)
from app.utils.sse import sse_token, sse_step, sse_done, make_step, extract_usage
from app.utils.log_utils import log_step

MODEL = "gpt-4o-mini"

generator_agent = Agent(name="generator", instructions=GENERATOR_SYSTEM_PROMPT, model=MODEL)
critic_agent = Agent(name="critic", instructions=CRITIC_SYSTEM_PROMPT, model=MODEL)
refiner_agent = Agent(name="refiner", instructions=REFINER_SYSTEM_PROMPT, model=MODEL)


async def run_reflection_stream(task: str):
    """Async generator yielding SSE events for the reflection loop."""
    max_iterations = 3
    draft = ""

    for iteration in range(1, max_iterations + 1):
        # Step 1: Generate (first iteration only)
        if iteration == 1:
            collected = []
            result = Runner.run_streamed(generator_agent, input=task)
            async for event in result.stream_events():
                if event.type == "raw_response_event" and isinstance(
                    event.data, ResponseTextDeltaEvent
                ):
                    delta = event.data.delta
                    collected.append(delta)
                    yield sse_token("generator", delta, iteration=iteration)

            draft = "".join(collected)
            usage = extract_usage(result)
            step = make_step("draft", "generator", draft, usage, iteration=iteration)
            log_step(step)
            yield sse_step(step)

        # Step 2: Critique
        critic_input = f"Task: {task}\n\nDraft:\n{draft}"
        collected = []
        result = Runner.run_streamed(critic_agent, input=critic_input)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("critic", delta, iteration=iteration)

        critique = "".join(collected)
        usage = extract_usage(result)
        step = make_step("critique", "critic", critique, usage, iteration=iteration)
        log_step(step)
        yield sse_step(step)

        # Check approval or max iterations
        if critique.strip().startswith("APPROVED") or iteration >= max_iterations:
            final_step = make_step("final", "system", draft, iteration=iteration)
            log_step(final_step)
            yield sse_step(final_step)
            break

        # Step 3: Refine
        refiner_input = f"Original task: {task}\n\nCurrent draft:\n{draft}\n\nFeedback:\n{critique}"
        collected = []
        result = Runner.run_streamed(refiner_agent, input=refiner_input)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("refiner", delta, iteration=iteration)

        refined = "".join(collected)
        usage = extract_usage(result)
        step = make_step("refinement", "refiner", refined, usage, iteration=iteration)
        log_step(step)
        yield sse_step(step)

        draft = refined

    yield sse_done()
