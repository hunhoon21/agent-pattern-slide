function createResultsViewer(containerId, patternType) {
  const container = document.getElementById(containerId);

  function formatTokens(n) {
    return (n || 0).toLocaleString('ko-KR') + ' 토큰';
  }

  function updateResults(steps) {
    if (!steps || steps.length === 0) {
      container.innerHTML = '<div class="results-placeholder">데모를 먼저 실행해주세요</div>';
      return;
    }

    container.innerHTML = '';

    if (patternType === 'reflection') {
      renderReflectionResults(steps);
    } else {
      renderOrchestratorResults(steps);
    }
  }

  function renderReflectionResults(steps) {
    // Group steps by iteration
    const iterations = {};
    steps.forEach(s => {
      if (!iterations[s.iteration]) iterations[s.iteration] = {};
      iterations[s.iteration][s.type] = s;
    });

    // Summary stats
    const totalTokens = steps.reduce((sum, s) => sum + (s.tokenUsage?.total_tokens || 0), 0);
    const iterCount = Math.max(...steps.map(s => s.iteration || 0));
    const elapsed = steps.length > 1 ?
      ((new Date(steps[steps.length-1].timestamp) - new Date(steps[0].timestamp)) / 1000).toFixed(1) : '0';

    const summary = document.createElement('div');
    summary.className = 'summary-stats';
    summary.innerHTML = `
      <div class="stat-card"><div class="stat-value">${iterCount}</div><div class="stat-label">반복 횟수</div></div>
      <div class="stat-card"><div class="stat-value">${formatTokens(totalTokens)}</div><div class="stat-label">총 사용량</div></div>
      <div class="stat-card"><div class="stat-value">${elapsed}초</div><div class="stat-label">소요 시간</div></div>
    `;
    container.appendChild(summary);

    // Tabs for iterations
    const tabBar = document.createElement('div');
    tabBar.className = 'results-tabs';
    const tabContent = document.createElement('div');
    tabContent.className = 'results-tab-content';

    Object.keys(iterations).forEach((iterKey, idx) => {
      const tab = document.createElement('button');
      tab.className = 'results-tab' + (idx === 0 ? ' active' : '');
      tab.textContent = `반복 ${iterKey}`;
      tab.addEventListener('click', () => {
        tabBar.querySelectorAll('.results-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderIterationContent(iterations[iterKey], tabContent);
      });
      tabBar.appendChild(tab);
    });

    container.appendChild(tabBar);
    container.appendChild(tabContent);

    // Render first iteration
    const firstKey = Object.keys(iterations)[0];
    if (firstKey) renderIterationContent(iterations[firstKey], tabContent);

    // Token chart
    renderTokenChart(steps, container);
  }

  function renderIterationContent(iterData, contentEl) {
    contentEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'three-column';

    ['draft', 'critique', 'refinement'].forEach(type => {
      const panel = document.createElement('div');
      panel.className = 'column-panel';
      const headerText = type === 'draft' ? '초안' : type === 'critique' ? '비평' : '개선';
      const colorClass = type === 'draft' ? 'blue' : type === 'critique' ? 'orange' : 'green';
      panel.innerHTML = `
        <div class="column-header ${colorClass}">${headerText}</div>
        <div class="column-content">${iterData[type]?.content || '(없음)'}</div>
      `;
      grid.appendChild(panel);
    });

    contentEl.appendChild(grid);
  }

  function renderOrchestratorResults(steps) {
    const planning = steps.find(s => s.type === 'planning');
    const workers = steps.filter(s => s.type === 'worker_complete');
    const final = steps.find(s => s.type === 'final');

    // Summary stats
    const totalTokens = steps.reduce((sum, s) => sum + (s.tokenUsage?.total_tokens || 0), 0);
    const elapsed = steps.length > 1 ?
      ((new Date(steps[steps.length-1].timestamp) - new Date(steps[0].timestamp)) / 1000).toFixed(1) : '0';

    const summary = document.createElement('div');
    summary.className = 'summary-stats';
    summary.innerHTML = `
      <div class="stat-card"><div class="stat-value">${workers.length}</div><div class="stat-label">워커 수</div></div>
      <div class="stat-card"><div class="stat-value">${formatTokens(totalTokens)}</div><div class="stat-label">총 사용량</div></div>
      <div class="stat-card"><div class="stat-value">${elapsed}초</div><div class="stat-label">소요 시간</div></div>
    `;
    container.appendChild(summary);

    // Planning section
    if (planning) {
      const planSection = document.createElement('div');
      planSection.className = 'result-section';
      planSection.innerHTML = `<h3 class="section-title">작업 분해</h3>`;
      try {
        const parsed = JSON.parse(planning.content);
        const tasks = parsed.subtasks || (Array.isArray(parsed) ? parsed : Object.values(parsed).find(v => Array.isArray(v))) || [];
        const list = document.createElement('div');
        list.className = 'subtask-list';
        tasks.forEach((t, i) => {
          list.innerHTML += `<div class="subtask-item"><strong>워커 ${i+1}: ${t.title}</strong><p>${t.description}</p></div>`;
        });
        planSection.appendChild(list);
      } catch { planSection.innerHTML += `<pre>${planning.content}</pre>`; }
      container.appendChild(planSection);
    }

    // Workers section (3 columns)
    if (workers.length > 0) {
      const workerSection = document.createElement('div');
      workerSection.className = 'result-section';
      workerSection.innerHTML = '<h3 class="section-title">워커 실행 결과</h3>';
      const grid = document.createElement('div');
      grid.className = 'three-column';
      workers.forEach((w, i) => {
        const panel = document.createElement('div');
        panel.className = 'column-panel';
        panel.innerHTML = `
          <div class="column-header teal">워커 ${(w.workerId ?? i) + 1} <span class="token-badge">${formatTokens(w.tokenUsage?.total_tokens || 0)}</span></div>
          <div class="column-content">${w.content}</div>
        `;
        grid.appendChild(panel);
      });
      workerSection.appendChild(grid);
      container.appendChild(workerSection);
    }

    // Final section
    if (final) {
      const finalSection = document.createElement('div');
      finalSection.className = 'result-section';
      finalSection.innerHTML = `<h3 class="section-title">통합 결과</h3><div class="final-content">${final.content}</div>`;
      container.appendChild(finalSection);
    }

    // Token chart and Gantt
    renderTokenChart(steps, container);
    renderGantt(steps, container);
  }

  function renderTokenChart(steps, parentEl) {
    const chartSteps = steps.filter(s => s.tokenUsage && s.tokenUsage.total_tokens > 0);
    if (chartSteps.length === 0) return;

    const maxTokens = Math.max(...chartSteps.map(s => s.tokenUsage.total_tokens));
    const section = document.createElement('div');
    section.className = 'result-section';
    section.innerHTML = '<h3 class="section-title">토큰 사용량</h3>';
    const chart = document.createElement('div');
    chart.className = 'token-chart';

    chartSteps.forEach(s => {
      const agentLabel = s.agent === 'worker' ? `워커 ${(s.workerId ?? 0)+1}` : (AGENT_LABELS[s.agent] || s.agent);
      const colorClass = AGENT_CHART_COLORS[s.agent] || 'blue';
      const pct = (s.tokenUsage.total_tokens / maxTokens * 100).toFixed(0);
      chart.innerHTML += `
        <div class="chart-row">
          <span class="chart-label">${agentLabel}</span>
          <div class="chart-bar-container"><div class="chart-bar ${colorClass}" style="width:${pct}%"></div></div>
          <span class="chart-value">${formatTokens(s.tokenUsage.total_tokens)}</span>
        </div>
      `;
    });
    section.appendChild(chart);
    parentEl.appendChild(section);
  }

  function renderGantt(steps, parentEl) {
    const timedSteps = steps.filter(s => s.timestamp && s.tokenUsage?.total_tokens > 0);
    if (timedSteps.length < 2) return;

    const startTime = new Date(timedSteps[0].timestamp).getTime();
    const endTime = new Date(timedSteps[timedSteps.length - 1].timestamp).getTime();
    const totalDuration = endTime - startTime || 1;

    const section = document.createElement('div');
    section.className = 'result-section';
    section.innerHTML = '<h3 class="section-title">실행 타임라인</h3>';
    const gantt = document.createElement('div');
    gantt.className = 'gantt-container';

    // Build pairs of start->complete for workers, simple bars for others
    const workerStarts = {};
    timedSteps.forEach(s => {
      if (s.type === 'worker_start') workerStarts[s.workerId] = new Date(s.timestamp).getTime();
    });

    timedSteps.filter(s => s.tokenUsage?.total_tokens > 0).forEach(s => {
      const sTime = s.type === 'worker_complete' && workerStarts[s.workerId] !== undefined
        ? workerStarts[s.workerId] : new Date(s.timestamp).getTime() - 1000;
      const eTime = new Date(s.timestamp).getTime();
      const left = ((sTime - startTime) / totalDuration * 100).toFixed(1);
      const width = Math.max(2, ((eTime - sTime) / totalDuration * 100)).toFixed(1);
      const label = s.agent === 'worker' ? `워커 ${(s.workerId ?? 0)+1}` : (AGENT_LABELS[s.agent] || s.agent);
      const colorClass = AGENT_CHART_COLORS[s.agent] || 'blue';

      gantt.innerHTML += `
        <div class="gantt-row">
          <span class="gantt-label">${label}</span>
          <div class="gantt-bar-area"><div class="gantt-bar ${colorClass}" style="left:${left}%;width:${width}%"></div></div>
        </div>
      `;
    });

    section.appendChild(gantt);
    parentEl.appendChild(section);
  }

  // Agent label and color mappings
  const AGENT_LABELS = { generator: '생성기', critic: '비평가', refiner: '개선기', orchestrator: '오케스트레이터', worker: '워커', synthesizer: '합성기' };
  const AGENT_CHART_COLORS = { generator: 'blue', critic: 'orange', refiner: 'green', orchestrator: 'purple', worker: 'teal', synthesizer: 'gold' };

  // Listen for results-updated events
  document.addEventListener('results-updated', (e) => {
    if (e.detail.patternType === patternType) {
      updateResults(e.detail.steps);
    }
  });

  return { updateResults };
}
