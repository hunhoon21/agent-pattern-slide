# Web Slide - Multi-Agent Pattern Demo

## Project Overview

OpenAI Agents SDK 기반 멀티 에이전트 패턴(Reflection Loop, Orchestrator-Worker)을 인터랙티브 슬라이드로 시연하는 웹 애플리케이션.

## Tech Stack

- **Backend:** Python 3.12+, FastAPI, Uvicorn
- **AI:** OpenAI Agents SDK (`openai-agents`)
- **Frontend:** Vanilla HTML/CSS/JS (no framework)
- **Font:** Pretendard (CDN)
- **Package Manager:** uv

## Project Structure

```
web-slide/
├── main.py                     # Uvicorn entrypoint (port 3000)
├── pyproject.toml              # Python project config
├── .env                        # OPENAI_API_KEY (not committed)
├── .env.example                # Environment template
├── app/
│   ├── server.py               # FastAPI app, routes, static files
│   ├── agents/
│   │   ├── reflection.py       # Reflection Loop agent (Generator → Critic → Refiner)
│   │   └── orchestrator.py     # Orchestrator-Worker agent (Plan → Workers → Synthesize)
│   ├── prompts/
│   │   ├── reflection_prompts.py
│   │   └── orchestrator_prompts.py
│   └── utils/
│       ├── sse.py              # Server-Sent Events helper
│       └── log_utils.py        # Logging utilities
└── public/                     # Static frontend (served by FastAPI)
    ├── index.html              # 7-slide presentation
    ├── css/
    │   ├── slides.css          # Slide layout, theme variables, typography
    │   ├── chatbot.css         # Chat UI, cards, pipeline visualization
    │   └── results.css         # Results viewer, charts, tables
    └── js/
        ├── app.js              # Slide navigation, keyboard shortcuts
        ├── chatbot.js          # Chat interaction, SSE streaming
        ├── results-viewer.js   # Results tab rendering
        ├── reflection-ui.js    # Reflection demo UI + SVG diagram
        └── orchestrator-ui.js  # Orchestrator demo UI + SVG diagram
```

## Slide Structure (7 slides)

| Slide | Type | Content |
|-------|------|---------|
| 1 | Title | 멀티 에이전트 패턴 소개 |
| 2 | Explanation | Reflection Loop 패턴 설명 + SVG 다이어그램 + 장단점 |
| 3 | Demo | Reflection Loop 인터랙티브 데모 (챗봇) |
| 4 | Results | Reflection Loop 결과 분석 |
| 5 | Explanation | Orchestrator-Worker 패턴 설명 + SVG 다이어그램 + 장단점 |
| 6 | Demo | Orchestrator-Worker 인터랙티브 데모 (파이프라인) |
| 7 | Results | Orchestrator-Worker 결과 분석 |

## Development

```bash
# Setup
uv sync
cp .env.example .env
# Add OPENAI_API_KEY to .env

# Run
uv run python main.py
# → http://localhost:3000
```

## Architecture Patterns

### Reflection Loop
User Input → Generator → Critic (pass/feedback) → Refiner → loop back to Critic
- SSE streaming for real-time token display
- Iteration counter in sidebar

### Orchestrator-Worker
User Input → Orchestrator (plan) → Workers (parallel) → Synthesizer (merge)
- 3 parallel workers with independent subtasks
- Pipeline phase visualization

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/reflection` | Reflection Loop SSE stream |
| POST | `/api/orchestrator` | Orchestrator-Worker SSE stream |
| GET | `/` | Static frontend |

## Key Conventions

- CSS variables defined in `:root` of `slides.css` control the theme
- White theme with accent colors: blue, green, orange, purple, teal, gold
- SVG diagrams are inline in JS files (`reflection-ui.js`, `orchestrator-ui.js`)
- All text is Korean (ko), English labels in `<span class="en">`
- SSE format: `data: {json}\n\n` with `data: [DONE]\n\n` terminator
