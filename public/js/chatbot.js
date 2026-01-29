/**
 * Create a chatbot instance for a pattern demo
 * @param {Object} config
 * @param {string} config.chatAreaId - ID of chat area container
 * @param {string} config.inputId - ID of text input
 * @param {string} config.sendBtnId - ID of send button
 * @param {string} config.apiEndpoint - API URL (e.g., '/api/reflection')
 * @param {string} config.patternType - 'reflection' or 'orchestrator'
 * @param {Function} [config.onToken] - Optional external token handler (for orchestrator-ui routing)
 * @param {Function} [config.onStep] - Optional external step handler
 * @param {Function} [config.onDone] - Optional completion handler
 */
function createChatbot(config) {
  const chatArea = document.getElementById(config.chatAreaId);
  const input = document.getElementById(config.inputId);
  const sendBtn = document.getElementById(config.sendBtnId);

  let state = 'idle'; // idle | loading | streaming | complete | error
  let allSteps = [];
  let abortController = null;
  let activeCards = {}; // track active cards by agent+iteration/workerId

  // Agent name mapping (Korean)
  const AGENT_NAMES = {
    generator: '생성기',
    critic: '비평가',
    refiner: '개선기',
    orchestrator: '오케스트레이터',
    worker: '워커',
    synthesizer: '합성기',
    system: '시스템'
  };

  // Agent color classes
  const AGENT_COLORS = {
    generator: 'draft',
    critic: 'critique',
    refiner: 'refinement',
    system: 'final',
    orchestrator: 'final',  // purple
    worker: 'worker',
    synthesizer: 'synthesizer'
  };

  function formatTokens(n) {
    return n.toLocaleString('ko-KR') + ' 토큰';
  }

  function getCardKey(event) {
    if (event.agent === 'worker' && event.workerId !== undefined) {
      return `worker-${event.workerId}`;
    }
    if (event.iteration !== undefined) {
      return `${event.agent}-${event.iteration}`;
    }
    return event.agent;
  }

  function createStepCard(agentName, colorClass) {
    const card = document.createElement('div');
    card.className = `step-card ${colorClass}`;
    card.innerHTML = `
      <div class="card-header">
        <span class="agent-badge ${colorClass}">${AGENT_NAMES[agentName] || agentName}</span>
        <span class="token-badge"></span>
      </div>
      <div class="card-content"><span class="streaming-cursor">|</span></div>
    `;
    chatArea.appendChild(card);
    chatArea.scrollTop = chatArea.scrollHeight;
    return card;
  }

  function getOrCreateCard(event) {
    const key = getCardKey(event);
    if (!activeCards[key]) {
      const agentName = event.agent;
      const colorClass = AGENT_COLORS[agentName] || 'draft';
      activeCards[key] = createStepCard(agentName, colorClass);
    }
    return activeCards[key];
  }

  function handleToken(event) {
    const card = getOrCreateCard(event);
    const content = card.querySelector('.card-content');
    // Remove cursor, append text, add cursor back
    const cursor = content.querySelector('.streaming-cursor');
    if (cursor) cursor.remove();
    content.appendChild(document.createTextNode(event.delta));
    const newCursor = document.createElement('span');
    newCursor.className = 'streaming-cursor';
    newCursor.textContent = '|';
    content.appendChild(newCursor);
    chatArea.scrollTop = chatArea.scrollHeight;

    if (config.onToken) config.onToken(event);
  }

  function handleStep(step) {
    allSteps.push(step);

    // For step completion, finalize the card
    let key;
    if (step.type === 'draft') key = `generator-${step.iteration}`;
    else if (step.type === 'critique') key = `critic-${step.iteration}`;
    else if (step.type === 'refinement') key = `refiner-${step.iteration}`;
    else if (step.type === 'worker_complete') key = `worker-${step.workerId}`;
    else if (step.type === 'final') key = step.agent === 'synthesizer' ? 'synthesizer' : `system-${step.iteration}`;
    else if (step.type === 'planning') key = 'orchestrator';
    else if (step.type === 'synthesizing') key = 'synthesizer';
    else if (step.type === 'worker_start') {
      // Create card for worker start
      const wsKey = `worker-${step.workerId}`;
      if (!activeCards[wsKey]) {
        activeCards[wsKey] = createStepCard('worker', 'worker');
      }
      return;
    }

    if (key && activeCards[key]) {
      const card = activeCards[key];
      // Remove streaming cursor
      const cursor = card.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();
      // Update token badge
      if (step.tokenUsage && step.tokenUsage.total_tokens > 0) {
        const badge = card.querySelector('.token-badge');
        badge.textContent = formatTokens(step.tokenUsage.total_tokens);
      }
    }

    // For final step, also create a "final" card if it's a system/final step with content
    if (step.type === 'final' && step.content && !activeCards[key]) {
      const card = createStepCard('system', 'final');
      const content = card.querySelector('.card-content');
      content.textContent = step.content;
      const cursor = content.querySelector('.streaming-cursor');
      if (cursor) cursor.remove();
    }

    if (config.onStep) config.onStep(step);

    // Dispatch results-updated event
    document.dispatchEvent(new CustomEvent('results-updated', {
      detail: { patternType: config.patternType, steps: allSteps }
    }));
  }

  async function submit() {
    const task = input.value.trim();
    if (!task || state === 'loading' || state === 'streaming') return;

    // Reset
    chatArea.innerHTML = '';
    activeCards = {};
    allSteps = [];
    state = 'loading';
    input.disabled = true;
    sendBtn.disabled = true;

    abortController = new AbortController();

    try {
      const response = await fetch(config.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task }),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      state = 'streaming';
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep incomplete line

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              state = 'complete';
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'token') {
                handleToken(parsed);
              } else if (parsed.type === 'step') {
                handleStep(parsed.step);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.message);
              }
            } catch (e) {
              if (e.message && !e.message.startsWith('Unexpected')) {
                throw e; // re-throw real errors
              }
              console.warn('Failed to parse SSE event:', data);
            }
          }
        }
        if (state === 'complete') break;
      }

      state = 'complete';
      if (config.onDone) config.onDone(allSteps);

    } catch (err) {
      if (err.name === 'AbortError') return;
      state = 'error';
      const errorCard = document.createElement('div');
      errorCard.className = 'step-card error';
      errorCard.innerHTML = `
        <div class="card-header"><span class="agent-badge">오류</span></div>
        <div class="card-content">${err.message || '알 수 없는 오류가 발생했습니다'}</div>
      `;
      chatArea.appendChild(errorCard);
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  // Event listeners
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  return {
    getResults: () => allSteps,
    abort: () => {
      if (abortController) abortController.abort();
    }
  };
}
