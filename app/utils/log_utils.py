import logging

logger = logging.getLogger("web-slide")
logger.setLevel(logging.INFO)
_handler = logging.StreamHandler()
_handler.setFormatter(logging.Formatter("[%(asctime)s] %(message)s", datefmt="%H:%M:%S"))
logger.addHandler(_handler)


def log_step(step: dict) -> None:
    agent = step.get("agent", "unknown")
    step_type = step.get("type", "unknown")
    content_preview = (step.get("content", "") or "")[:80]
    tokens = step.get("tokenUsage", {})
    total = tokens.get("total_tokens", 0)
    iteration = step.get("iteration")
    worker_id = step.get("workerId")

    context = ""
    if iteration is not None:
        context += f" [iter={iteration}]"
    if worker_id is not None:
        context += f" [worker={worker_id}]"

    logger.info(f"[{agent}] {step_type}{context} | tokens={total} | {content_preview}...")
