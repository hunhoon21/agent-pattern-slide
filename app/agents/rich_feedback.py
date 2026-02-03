from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent

from app.prompts.rich_feedback_prompts import (
    CODE_ANALYZER_PROMPT,
    CODE_FIXER_PROMPT,
    CODE_VALIDATOR_PROMPT,
)
from app.utils.sse import sse_token, sse_step, sse_done, make_step, extract_usage
from app.utils.log_utils import log_step

MODEL = "gpt-4o-mini"

analyzer_agent = Agent(name="analyzer", instructions=CODE_ANALYZER_PROMPT, model=MODEL)
fixer_agent = Agent(name="fixer", instructions=CODE_FIXER_PROMPT, model=MODEL)
validator_agent = Agent(name="validator", instructions=CODE_VALIDATOR_PROMPT, model=MODEL)


async def run_rich_feedback_stream(code: str):
    """Async generator yielding SSE events for the rich feedback loop."""
    max_iterations = 3
    current_code = code
    original_code = code

    for iteration in range(1, max_iterations + 1):
        # Step 1: Analyze code
        collected = []
        result = Runner.run_streamed(analyzer_agent, input=current_code)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("analyzer", delta, iteration=iteration)

        analysis = "".join(collected)
        usage = extract_usage(result)
        step = make_step("analysis", "analyzer", analysis, usage, iteration=iteration)
        log_step(step)
        yield sse_step(step)

        # Check if no issues found
        if '"issues": []' in analysis or "no issues" in analysis.lower():
            final_step = make_step(
                "final",
                "system",
                current_code,
                iteration=iteration,
            )
            log_step(final_step)
            yield sse_step(final_step)
            break

        # Step 2: Fix code
        fixer_input = f"Original code:\n{current_code}\n\nIssues identified:\n{analysis}"
        collected = []
        result = Runner.run_streamed(fixer_agent, input=fixer_input)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("fixer", delta, iteration=iteration)

        fixed_code = "".join(collected)
        usage = extract_usage(result)
        step = make_step("fix_attempt", "fixer", fixed_code, usage, iteration=iteration)
        log_step(step)
        yield sse_step(step)

        # Step 3: Validate fixes
        validator_input = f"Original code:\n{original_code}\n\nIssues found:\n{analysis}\n\nFixed code:\n{fixed_code}"
        collected = []
        result = Runner.run_streamed(validator_agent, input=validator_input)
        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(
                event.data, ResponseTextDeltaEvent
            ):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("validator", delta, iteration=iteration)

        validation = "".join(collected)
        usage = extract_usage(result)
        step = make_step("validation", "validator", validation, usage, iteration=iteration)
        log_step(step)
        yield sse_step(step)

        # Check if all issues are fixed or max iterations reached
        if (
            '"all_fixed": true' in validation
            or '"verdict": "pass"' in validation
            or iteration >= max_iterations
        ):
            final_step = make_step(
                "final",
                "system",
                fixed_code,
                iteration=iteration,
            )
            log_step(final_step)
            yield sse_step(final_step)
            break

        # Continue with fixed code for next iteration
        current_code = fixed_code

    yield sse_done()
