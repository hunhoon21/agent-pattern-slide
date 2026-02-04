/**
 * Graph of Thoughts Demo UI
 * Vanilla JavaScript - no modules
 */

// Global state for results sharing
window.gotResults = null;

/**
 * Initialize GoT demo on slide 9
 */
function initGotDemo() {
  const input = document.getElementById('got-input');
  const sendBtn = document.getElementById('got-send');
  const svgContainer = document.getElementById('got-graph-svg');
  const detailPanel = document.getElementById('got-detail-panel');

  if (!input || !sendBtn || !svgContainer || !detailPanel) return;

  let abortController = null;
  let allSteps = [];
  let nodes = [];
  let edges = [];
  let selectedNodeId = null;

  async function submit() {
    const task = input.value.trim();
    if (!task) return;

    // Reset state
    nodes = [];
    edges = [];
    selectedNodeId = null;
    allSteps = [];
    svgContainer.innerHTML = '';
    detailPanel.innerHTML = '<p class="text-gray-500">사고 노드를 선택하세요</p>';
    input.disabled = true;
    sendBtn.disabled = true;

    abortController = new AbortController();

    try {
      const response = await fetch('/api/got', {
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
              if (parsed.type === 'step') handleStep(parsed.step);
              else if (parsed.type === 'error') throw new Error(parsed.message);
            } catch (e) {
              if (e.message && !e.message.startsWith('Unexpected')) throw e;
            }
          }
        }
      }

      // Store results globally
      window.gotResults = { steps: allSteps };

      // Dispatch results event
      document.dispatchEvent(new CustomEvent('results-updated', {
        detail: { patternType: 'got', steps: allSteps }
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      detailPanel.innerHTML = `<p class="text-red-600">${err.message || '오류가 발생했습니다'}</p>`;
    } finally {
      input.disabled = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  function handleStep(step) {
    allSteps.push(step);

    if (step.type === 'thought_node') {
      addThoughtNode(step.node);
      renderGraph();
    } else if (step.type === 'evaluation') {
      updateNodeScore(step.nodeId, step.score);
    } else if (step.type === 'synthesis') {
      // Highlight best path
      if (step.bestPath) {
        highlightBestPath(step.bestPath);
      }
    } else if (step.type === 'final') {
      // Show final result in detail panel if no node selected
      if (!selectedNodeId) {
        detailPanel.innerHTML = `
          <div class="p-4">
            <h3 class="font-semibold text-lg mb-2">최종 결과</h3>
            <p class="text-gray-700 whitespace-pre-wrap">${escapeHtml(step.result)}</p>
          </div>
        `;
      }
    }
  }

  function addThoughtNode(node) {
    if (!node || !node.id) return; // Guard against undefined/invalid nodes

    const existingIndex = nodes.findIndex(n => n.id === node.id);
    if (existingIndex >= 0) {
      nodes[existingIndex] = node;
    } else {
      nodes.push(node);
    }

    // Add edge if parent exists
    if (node.parentId && !edges.find(e => e.from === node.parentId && e.to === node.id)) {
      edges.push({ from: node.parentId, to: node.id });
    }
  }

  function updateNodeScore(nodeId, score) {
    const node = nodes.find(n => n.id === nodeId);
    if (node) {
      node.score = score;
      renderGraph();
    }
  }

  function highlightBestPath(path) {
    if (!Array.isArray(path)) return;
    nodes.forEach(n => {
      if (n && n.id) {
        n.bestPath = path.includes(n.id);
      }
    });
    renderGraph();
  }

  function renderGraph() {
    if (nodes.length === 0) return;

    // Calculate positions using tree layout
    const positions = calculateTreeLayout(nodes, edges);

    // Create SVG
    const width = 800;
    const height = 600;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    svg.style.width = '100%';
    svg.style.height = '100%';

    // Add marker for arrows
    const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
    defs.innerHTML = `
      <marker id="arrowhead-got" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
      </marker>
      <marker id="arrowhead-best" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
        <polygon points="0 0, 10 3, 0 6" fill="#10b981" />
      </marker>
    `;
    svg.appendChild(defs);

    // Draw edges
    edges.forEach(edge => {
      const fromNode = nodes.find(n => n && n.id === edge.from);
      const toNode = nodes.find(n => n && n.id === edge.to);
      if (!fromNode || !toNode) return;

      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return;

      const isBestPath = (fromNode.bestPath || false) && (toNode.bestPath || false);
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', fromPos.x);
      line.setAttribute('y1', fromPos.y);
      line.setAttribute('x2', toPos.x);
      line.setAttribute('y2', toPos.y);
      line.setAttribute('stroke', isBestPath ? '#10b981' : '#9ca3af');
      line.setAttribute('stroke-width', isBestPath ? '3' : '2');
      line.setAttribute('marker-end', isBestPath ? 'url(#arrowhead-best)' : 'url(#arrowhead-got)');
      svg.appendChild(line);
    });

    // Draw nodes
    nodes.forEach(node => {
      const pos = positions[node.id];
      if (!pos) return;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.cursor = 'pointer';
      g.addEventListener('click', () => selectNode(node.id));

      // Node circle with color based on score
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      circle.setAttribute('cx', pos.x);
      circle.setAttribute('cy', pos.y);
      circle.setAttribute('r', '30');
      circle.setAttribute('fill', getNodeColor(node));
      circle.setAttribute('stroke', node.bestPath ? '#10b981' : '#1a1a2a');
      circle.setAttribute('stroke-width', node.bestPath ? '3' : '2');
      g.appendChild(circle);

      // Node label
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', pos.x);
      text.setAttribute('y', pos.y + 5);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('fill', '#ffffff');
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', 'bold');
      text.textContent = node.id;
      g.appendChild(text);

      // Score badge if evaluated
      if (node.score !== undefined) {
        const scoreText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        scoreText.setAttribute('x', pos.x);
        scoreText.setAttribute('y', pos.y + 50);
        scoreText.setAttribute('text-anchor', 'middle');
        scoreText.setAttribute('fill', '#1a1a2a');
        scoreText.setAttribute('font-size', '12');
        scoreText.textContent = `${node.score.toFixed(1)}`;
        g.appendChild(scoreText);
      }

      svg.appendChild(g);
    });

    svgContainer.innerHTML = '';
    svgContainer.appendChild(svg);
  }

  function calculateTreeLayout(nodes, edges) {
    const positions = {};
    const levels = {};

    // Find root nodes (no parents)
    const roots = nodes.filter(n => n && n.id && !n.parentId);
    if (roots.length === 0 && nodes.length > 0) {
      roots.push(nodes[0]);
    }

    // BFS to assign levels
    const queue = roots.map(n => ({ node: n, level: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
      const { node, level } = queue.shift();
      if (!node || !node.id || visited.has(node.id)) continue;
      visited.add(node.id);

      levels[node.id] = level;

      // Find children
      const children = edges.filter(e => e.from === node.id).map(e => nodes.find(n => n.id === e.to)).filter(Boolean);
      children.forEach(child => {
        if (child && child.id) {
          queue.push({ node: child, level: level + 1 });
        }
      });
    }

    // Calculate positions
    const levelCounts = {};
    const levelIndex = {};

    nodes.forEach(node => {
      const level = levels[node.id] || 0;
      levelCounts[level] = (levelCounts[level] || 0) + 1;
    });

    nodes.forEach(node => {
      const level = levels[node.id] || 0;
      levelIndex[level] = levelIndex[level] || 0;
      const count = levelCounts[level];
      const index = levelIndex[level]++;

      positions[node.id] = {
        x: 100 + (600 / (count + 1)) * (index + 1),
        y: 80 + level * 120
      };
    });

    return positions;
  }

  function getNodeColor(node) {
    if (node.score === undefined) return '#6b7280'; // gray
    if (node.score >= 8) return '#10b981'; // green
    if (node.score >= 6) return '#3b82f6'; // blue
    if (node.score >= 4) return '#f59e0b'; // orange
    return '#ef4444'; // red
  }

  function selectNode(nodeId) {
    selectedNodeId = nodeId;
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;

    detailPanel.innerHTML = `
      <div class="p-4">
        <div class="flex items-center justify-between mb-3">
          <h3 class="font-semibold text-lg">사고 노드 ${node.id}</h3>
          ${node.score !== undefined ? `<span class="px-2 py-1 rounded text-sm font-medium" style="background: ${getNodeColor(node)}; color: white;">점수: ${node.score.toFixed(1)}</span>` : ''}
        </div>
        <div class="mb-3">
          <p class="text-sm text-gray-600 mb-1">내용:</p>
          <p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(node.content || node.text || '')}</p>
        </div>
        ${node.evaluation ? `
          <div>
            <p class="text-sm text-gray-600 mb-1">평가:</p>
            <p class="text-gray-700 text-sm">${escapeHtml(node.evaluation)}</p>
          </div>
        ` : ''}
      </div>
    `;
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event listeners
  sendBtn.addEventListener('click', submit);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); submit(); }
  });

  // Sample prompt handlers
  document.querySelectorAll('.got-sample-prompt').forEach(btn => {
    btn.addEventListener('click', () => {
      input.value = btn.dataset.prompt;
    });
  });

  // Create results viewer for slide 10
  const resultsViewer = createResultsViewer('got-results', 'got');

  return { resultsViewer };
}

/**
 * Initialize GoT explanation diagram on slide 8
 */
function initGotDiagram() {
  const diagramContainer = document.getElementById('got-diagram');
  if (!diagramContainer) return;

  diagramContainer.innerHTML = `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: 100%; max-height: 500px;">
      <!-- Definitions for gradients and markers -->
      <defs>
        <marker id="arrowhead-got-diagram" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#1a1a2a" />
        </marker>
        <linearGradient id="purple-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#a78bfa;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#8b5cf6;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="teal-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#5eead4;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#14b8a6;stop-opacity:1" />
        </linearGradient>
        <linearGradient id="gold-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" style="stop-color:#fbbf24;stop-opacity:1" />
          <stop offset="100%" style="stop-color:#d97706;stop-opacity:1" />
        </linearGradient>
      </defs>

      <!-- Initial thought node -->
      <rect x="320" y="30" width="160" height="60" rx="8" fill="#ffffff" stroke="#1a1a2a" stroke-width="2"/>
      <text x="400" y="55" text-anchor="middle" font-size="14" font-weight="600" fill="#1a1a2a">초기 사고 <tspan class="en" font-size="12">(Initial)</tspan></text>
      <text x="400" y="75" text-anchor="middle" font-size="12" fill="#666">문제 입력</text>

      <!-- Branch arrows to 3 paths -->
      <line x1="350" y1="90" x2="150" y2="150" stroke="#1a1a2a" stroke-width="2" marker-end="url(#arrowhead-got-diagram)"/>
      <line x1="400" y1="90" x2="400" y2="150" stroke="#1a1a2a" stroke-width="2" marker-end="url(#arrowhead-got-diagram)"/>
      <line x1="450" y1="90" x2="650" y2="150" stroke="#1a1a2a" stroke-width="2" marker-end="url(#arrowhead-got-diagram)"/>

      <!-- Thought Path 1 (Purple) -->
      <rect x="70" y="160" width="160" height="60" rx="8" fill="url(#purple-gradient)" stroke="#8b5cf6" stroke-width="2"/>
      <text x="150" y="185" text-anchor="middle" font-size="13" font-weight="600" fill="#ffffff">사고 경로 1</text>
      <text x="150" y="205" text-anchor="middle" font-size="11" fill="#ffffff">접근법 A</text>

      <!-- Evaluation 1 -->
      <rect x="90" y="245" width="120" height="40" rx="6" fill="#ffffff" stroke="#8b5cf6" stroke-width="2"/>
      <text x="150" y="268" text-anchor="middle" font-size="12" font-weight="500" fill="#8b5cf6">평가: 7.5</text>

      <!-- Thought Path 2 (Teal) -->
      <rect x="320" y="160" width="160" height="60" rx="8" fill="url(#teal-gradient)" stroke="#14b8a6" stroke-width="2"/>
      <text x="400" y="185" text-anchor="middle" font-size="13" font-weight="600" fill="#ffffff">사고 경로 2</text>
      <text x="400" y="205" text-anchor="middle" font-size="11" fill="#ffffff">접근법 B</text>

      <!-- Evaluation 2 (Best) -->
      <rect x="340" y="245" width="120" height="40" rx="6" fill="#ffffff" stroke="#14b8a6" stroke-width="3"/>
      <text x="400" y="268" text-anchor="middle" font-size="12" font-weight="700" fill="#14b8a6">평가: 9.2 ⭐</text>

      <!-- Thought Path 3 (Gold) -->
      <rect x="570" y="160" width="160" height="60" rx="8" fill="url(#gold-gradient)" stroke="#d97706" stroke-width="2"/>
      <text x="650" y="185" text-anchor="middle" font-size="13" font-weight="600" fill="#ffffff">사고 경로 3</text>
      <text x="650" y="205" text-anchor="middle" font-size="11" fill="#ffffff">접근법 C</text>

      <!-- Evaluation 3 -->
      <rect x="590" y="245" width="120" height="40" rx="6" fill="#ffffff" stroke="#d97706" stroke-width="2"/>
      <text x="650" y="268" text-anchor="middle" font-size="12" font-weight="500" fill="#d97706">평가: 6.8</text>

      <!-- Merge arrows to synthesis -->
      <line x1="150" y1="285" x2="350" y2="360" stroke="#8b5cf6" stroke-width="2" marker-end="url(#arrowhead-got-diagram)" opacity="0.5"/>
      <line x1="400" y1="285" x2="400" y2="360" stroke="#14b8a6" stroke-width="3" marker-end="url(#arrowhead-got-diagram)"/>
      <line x1="650" y1="285" x2="450" y2="360" stroke="#d97706" stroke-width="2" marker-end="url(#arrowhead-got-diagram)" opacity="0.5"/>

      <!-- Synthesis node -->
      <rect x="320" y="370" width="160" height="60" rx="8" fill="#ffffff" stroke="#14b8a6" stroke-width="3"/>
      <text x="400" y="395" text-anchor="middle" font-size="14" font-weight="600" fill="#1a1a2a">통합 <tspan class="en" font-size="12">(Synthesis)</tspan></text>
      <text x="400" y="415" text-anchor="middle" font-size="12" fill="#666">최적 경로 선택</text>

      <!-- Arrow to final output -->
      <line x1="400" y1="430" x2="400" y2="480" stroke="#1a1a2a" stroke-width="2" marker-end="url(#arrowhead-got-diagram)"/>

      <!-- Final output node -->
      <rect x="320" y="490" width="160" height="60" rx="8" fill="#1a1a2a" stroke="#14b8a6" stroke-width="3"/>
      <text x="400" y="515" text-anchor="middle" font-size="14" font-weight="600" fill="#ffffff">최종 출력 <tspan class="en" font-size="12">(Final)</tspan></text>
      <text x="400" y="535" text-anchor="middle" font-size="12" fill="#14b8a6">검증된 답변</text>

      <!-- Annotations -->
      <text x="50" y="130" font-size="11" fill="#666" font-style="italic">병렬 탐색</text>
      <text x="710" y="240" font-size="11" fill="#666" font-style="italic">점수 평가</text>
      <text x="50" y="330" font-size="11" fill="#666" font-style="italic">수렴</text>
    </svg>
  `;
}

// Initialize diagram - call immediately if DOM already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGotDiagram);
} else {
  initGotDiagram();
}
