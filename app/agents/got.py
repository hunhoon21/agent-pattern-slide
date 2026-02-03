import asyncio
import json
import re

from agents import Agent, Runner
from openai.types.responses import ResponseTextDeltaEvent

from app.prompts.got_prompts import (
    THOUGHT_GENERATOR_PROMPT,
    THOUGHT_EVALUATOR_PROMPT,
    THOUGHT_SYNTHESIZER_PROMPT,
)
from app.utils.sse import sse_token, sse_step, sse_done, sse_error, make_step, extract_usage
from app.utils.log_utils import log_step

MODEL = "gpt-4o-mini"

thought_generator_agent = Agent(name="thought_generator", instructions=THOUGHT_GENERATOR_PROMPT, model=MODEL)
evaluator_agent = Agent(name="evaluator", instructions=THOUGHT_EVALUATOR_PROMPT, model=MODEL)
synthesizer_agent = Agent(name="synthesizer", instructions=THOUGHT_SYNTHESIZER_PROMPT, model=MODEL)


async def run_got_stream(task: str):
    """Async generator yielding SSE events for the Graph of Thoughts pattern.

    Flow:
    1. Generate 3 initial thoughts (parallel)
    2. Evaluate each thought (parallel)
    3. Select top 2 thoughts, expand each with 2 more thoughts
    4. Evaluate expanded thoughts
    5. Synthesize final answer from best path
    """

    thought_graph = []  # Track all thoughts with parent relationships
    thought_counter = 0

    # Phase 1: Generate initial thoughts
    initial_thoughts_text = []

    for i in range(3):
        collected = []
        result = Runner.run_streamed(thought_generator_agent, input=f"{task}\n\nGenerate thought #{i+1}")

        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                delta = event.data.delta
                collected.append(delta)
                yield sse_token("thought_generator", delta, worker_id=i)

        content = "".join(collected)
        initial_thoughts_text.append(content)

        thought_id = thought_counter
        thought_counter += 1

        thought_graph.append({
            "id": thought_id,
            "parent_id": None,
            "level": 0,
            "content": content,
            "score": None
        })

        usage = extract_usage(result)
        step = make_step(
            "thought_node",
            "thought_generator",
            content,
            usage,
            worker_id=i
        )
        step["data"] = {"thought_id": thought_id, "parent_id": None, "level": 0}
        log_step(step)
        yield sse_step(step)

    # Phase 2: Evaluate initial thoughts in parallel
    event_queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def evaluate_thought(thought_id: int, content: str, worker_id: int) -> dict:
        eval_input = f"Thought to evaluate:\n{content}"
        collected: list[str] = []
        result = Runner.run_streamed(evaluator_agent, input=eval_input)

        async for event in result.stream_events():
            if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                delta = event.data.delta
                collected.append(delta)
                await event_queue.put(sse_token("evaluator", delta, worker_id=worker_id))

        eval_content = "".join(collected)
        evaluation = _parse_evaluation(eval_content, thought_id)

        usage = extract_usage(result)
        eval_step = make_step("evaluation", "evaluator", eval_content, usage, worker_id=worker_id)
        eval_step["data"] = evaluation
        log_step(eval_step)
        await event_queue.put(sse_step(eval_step))

        return evaluation

    eval_tasks = [
        asyncio.create_task(evaluate_thought(i, initial_thoughts_text[i], i))
        for i in range(3)
    ]

    async def signal_done_evals():
        await asyncio.gather(*eval_tasks)
        await event_queue.put(None)

    asyncio.create_task(signal_done_evals())

    while True:
        event = await event_queue.get()
        if event is None:
            break
        yield event

    evaluations = [t.result() for t in eval_tasks]

    # Update thought graph with scores
    for i, evaluation in enumerate(evaluations):
        thought_graph[i]["score"] = evaluation["score"]

    # Phase 3: Select top 2 thoughts and expand
    sorted_thoughts = sorted(enumerate(evaluations), key=lambda x: x[1]["score"], reverse=True)
    top_2_indices = [sorted_thoughts[0][0], sorted_thoughts[1][0]]

    expanded_thoughts = []

    for parent_idx in top_2_indices:
        parent_id = parent_idx
        parent_content = initial_thoughts_text[parent_idx]

        # Generate 2 expansion thoughts
        for j in range(2):
            collected = []
            expand_input = f"Original problem: {task}\n\nBuild upon this thought:\n{parent_content}\n\nGenerate expansion #{j+1}"
            result = Runner.run_streamed(thought_generator_agent, input=expand_input)

            worker_id = parent_idx * 2 + j

            async for event in result.stream_events():
                if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
                    delta = event.data.delta
                    collected.append(delta)
                    yield sse_token("thought_generator", delta, worker_id=worker_id)

            content = "".join(collected)
            expanded_thoughts.append(content)

            thought_id = thought_counter
            thought_counter += 1

            thought_graph.append({
                "id": thought_id,
                "parent_id": parent_id,
                "level": 1,
                "content": content,
                "score": None
            })

            usage = extract_usage(result)
            step = make_step("thought_node", "thought_generator", content, usage, worker_id=worker_id)
            step["data"] = {"thought_id": thought_id, "parent_id": parent_id, "level": 1}
            log_step(step)
            yield sse_step(step)

    # Phase 4: Evaluate expanded thoughts in parallel
    event_queue = asyncio.Queue()

    eval_tasks = [
        asyncio.create_task(evaluate_thought(3 + i, expanded_thoughts[i], i))
        for i in range(len(expanded_thoughts))
    ]

    async def signal_done_expanded():
        await asyncio.gather(*eval_tasks)
        await event_queue.put(None)

    asyncio.create_task(signal_done_expanded())

    while True:
        event = await event_queue.get()
        if event is None:
            break
        yield event

    expanded_evaluations = [t.result() for t in eval_tasks]

    # Update thought graph with expanded scores
    for i, evaluation in enumerate(expanded_evaluations):
        thought_graph[3 + i]["score"] = evaluation["score"]

    # Phase 5: Synthesize final answer
    synth_start = make_step("synthesizing", "synthesizer", "")
    log_step(synth_start)
    yield sse_step(synth_start)

    # Build synthesis input with best thoughts
    all_evaluations = evaluations + expanded_evaluations
    best_thoughts_indices = sorted(
        range(len(thought_graph)),
        key=lambda i: thought_graph[i]["score"] or 0,
        reverse=True
    )[:3]

    synthesis_input = f"Original task: {task}\n\nBest thoughts:\n"
    for idx in best_thoughts_indices:
        thought = thought_graph[idx]
        synthesis_input += f"\n[Thought {thought['id']} (Score: {thought['score']})]\n{thought['content']}\n"

    collected: list[str] = []
    result = Runner.run_streamed(synthesizer_agent, input=synthesis_input)

    async for event in result.stream_events():
        if event.type == "raw_response_event" and isinstance(event.data, ResponseTextDeltaEvent):
            delta = event.data.delta
            collected.append(delta)
            yield sse_token("synthesizer", delta)

    synth_content = "".join(collected)
    usage = extract_usage(result)
    final_step = make_step("final", "synthesizer", synth_content, usage)
    final_step["data"] = {"thought_graph": thought_graph}
    log_step(final_step)
    yield sse_step(final_step)

    yield sse_done()


def _parse_evaluation(content: str, thought_id: int) -> dict:
    """Parse evaluation response into structured format."""
    try:
        # Try to parse as JSON first
        parsed = json.loads(content)
        return {
            "thought_id": parsed.get("thought_id", thought_id),
            "score": parsed.get("score", 5),
            "reasoning": parsed.get("reasoning", "")
        }
    except json.JSONDecodeError:
        # Fallback: extract score using regex
        score_match = re.search(r"score[\":\s]+(\d+)", content, re.IGNORECASE)
        score = int(score_match.group(1)) if score_match else 5

        return {
            "thought_id": thought_id,
            "score": score,
            "reasoning": content
        }
