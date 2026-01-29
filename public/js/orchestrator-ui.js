function initOrchestratorDemo() {
  const input = document.getElementById('orchestrator-input');
  const sendBtn = document.getElementById('orchestrator-send');
  let abortController = null;
  let allSteps = [];

  async function submit() {
    const task = input.value.trim();
    if (!task) return;

    // Reset pipeline cards
    document.querySelectorAll('#orchestrator-pipeline .card-content').forEach(el => el.textContent = '');
    document.querySelectorAll('.worker-status').forEach(el => { el.textContent = '대기중'; el.className = 'worker-status'; });
    allSteps = [];
    input.disabled = true;
    sendBtn.disabled = true;

    abortController = new AbortController();

    try {
      const response = await fetch('/api/orchestrator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: abortController.signal
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}: ${response.statusText}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let done = false;

      while (!done) {
        const result = await reader.read();
        if (result.done) break;

        buffer += decoder.decode(result.value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') { done = true; break; }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'token') handleToken(parsed);
              else if (parsed.type === 'step') handleStep(parsed.step);
              else if (parsed.type === 'error') throw new Error(parsed.message);
            } catch (e) {
              if (e.message && !e.message.startsWith('Unexpected')) throw e;
            }
          }
        }
      }

      // Dispatch results event for results viewer
      document.dispatchEvent(new CustomEvent('results-updated', {
        detail: { patternType: 'orchestrator', steps: allSteps }
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      const planCard = document.querySelector('#orch-plan-card .card-content');
      if (planCard) planCard.textContent = err.message || '오류가 발생했습니다';
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  function handleToken(event) {
    if (event.agent === 'worker' && event.workerId !== undefined) {
      const content = document.querySelector(`#worker-card-${event.workerId} .card-content`);
      if (content) content.textContent += event.delta;
    } else if (event.agent === 'synthesizer') {
      const content = document.querySelector('#synth-card .card-content');
      if (content) content.textContent += event.delta;
    } else if (event.agent === 'orchestrator') {
      const content = document.querySelector('#orch-plan-card .card-content');
      if (content) content.textContent += event.delta;
    }
  }

  function handleStep(step) {
    allSteps.push(step);

    if (step.type === 'planning') {
      // Show subtask titles in plan card
      const content = document.querySelector('#orch-plan-card .card-content');
      if (content && step.subtasks) {
        content.textContent = step.subtasks.map((t, i) => `${i + 1}. ${t.title}`).join('\n');
        // Update worker card subtitles
        step.subtasks.forEach((t, i) => {
          const subtitle = document.querySelector(`#worker-card-${i} .card-subtitle`);
          if (subtitle) subtitle.textContent = t.title;
        });
      }
      updateTokenBadge('#orch-plan-card', step.tokenUsage);
    } else if (step.type === 'worker_start') {
      const badge = document.querySelector(`#worker-card-${step.workerId} .worker-status`);
      if (badge) { badge.textContent = '실행 중'; badge.className = 'worker-status running'; }
    } else if (step.type === 'worker_complete') {
      const badge = document.querySelector(`#worker-card-${step.workerId} .worker-status`);
      if (badge) { badge.textContent = '완료'; badge.className = 'worker-status complete'; }
      updateTokenBadge(`#worker-card-${step.workerId}`, step.tokenUsage);
    } else if (step.type === 'synthesizing') {
      // Mark synthesis phase active
    } else if (step.type === 'final') {
      updateTokenBadge('#synth-card', step.tokenUsage);
    }
  }

  function updateTokenBadge(selector, usage) {
    if (!usage || !usage.total_tokens) return;
    const badge = document.querySelector(`${selector} .token-badge`);
    if (badge) badge.textContent = usage.total_tokens.toLocaleString('ko-KR') + ' 토큰';
  }

  // Event listeners
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  // Create results viewer for slide 7
  const resultsViewer = createResultsViewer('orchestrator-results', 'orchestrator');

  // Inject SVG diagram into #orchestrator-diagram
  const diagramContainer = document.getElementById('orchestrator-diagram');
  if (diagramContainer) {
    diagramContainer.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" style="display: block; max-height: calc(100vh - 12rem); width: auto;">
        <defs>
          <marker id="arrow" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
          </marker>
        </defs>

        <!-- User Input -->
        <rect x="125" y="20" width="150" height="50" rx="8" fill="transparent" stroke="#d1d5db" stroke-width="2"/>
        <text x="200" y="50" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">사용자 입력</text>

        <!-- Arrow to Orchestrator -->
        <line x1="200" y1="70" x2="200" y2="100" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>

        <!-- Orchestrator -->
        <rect x="75" y="100" width="250" height="50" rx="8" fill="transparent" stroke="#8b5cf6" stroke-width="2"/>
        <text x="200" y="130" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">오케스트레이터</text>
        <text x="200" y="145" text-anchor="middle" fill="#9ca3af" font-size="11">(Orchestrator)</text>

        <!-- Arrows to Workers -->
        <line x1="120" y1="150" x2="90" y2="190" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="200" y1="150" x2="200" y2="190" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="280" y1="150" x2="310" y2="190" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>

        <!-- Worker 1 -->
        <rect x="20" y="190" width="120" height="60" rx="8" fill="transparent" stroke="#14b8a6" stroke-width="2"/>
        <text x="80" y="215" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">워커 1</text>
        <text x="80" y="232" text-anchor="middle" fill="#9ca3af" font-size="11">(Worker)</text>

        <!-- Worker 2 -->
        <rect x="160" y="190" width="120" height="60" rx="8" fill="transparent" stroke="#14b8a6" stroke-width="2"/>
        <text x="220" y="215" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">워커 2</text>
        <text x="220" y="232" text-anchor="middle" fill="#9ca3af" font-size="11">(Worker)</text>

        <!-- Worker 3 -->
        <rect x="300" y="190" width="120" height="60" rx="8" fill="transparent" stroke="#14b8a6" stroke-width="2"/>
        <text x="360" y="215" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">워커 3</text>
        <text x="360" y="232" text-anchor="middle" fill="#9ca3af" font-size="11">(Worker)</text>

        <!-- Dashed lines connecting workers (parallel) -->
        <line x1="140" y1="220" x2="160" y2="220" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4"/>
        <line x1="280" y1="220" x2="300" y2="220" stroke="#6b7280" stroke-width="1" stroke-dasharray="4,4"/>

        <!-- Arrows from Workers to Synthesizer -->
        <line x1="90" y1="250" x2="160" y2="320" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="220" y1="250" x2="200" y2="320" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>
        <line x1="310" y1="250" x2="240" y2="320" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>

        <!-- Synthesizer -->
        <rect x="125" y="320" width="150" height="60" rx="8" fill="transparent" stroke="#f59e0b" stroke-width="2"/>
        <text x="200" y="345" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">합성기</text>
        <text x="200" y="362" text-anchor="middle" fill="#9ca3af" font-size="11">(Synthesizer)</text>

        <!-- Arrow to Final Result -->
        <line x1="200" y1="380" x2="200" y2="410" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrow)"/>

        <!-- Final Result -->
        <rect x="125" y="410" width="150" height="50" rx="8" fill="transparent" stroke="#10b981" stroke-width="2"/>
        <text x="200" y="440" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">최종 결과</text>
      </svg>
    `;
  }

  return { resultsViewer };
}
