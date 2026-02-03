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
    nodes.forEach(n => n.bestPath = path.includes(n.id));
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
      const fromNode = nodes.find(n => n.id === edge.from);
      const toNode = nodes.find(n => n.id === edge.to);
      if (!fromNode || !toNode) return;

      const fromPos = positions[edge.from];
      const toPos = positions[edge.to];
      if (!fromPos || !toPos) return;

      const isBestPath = fromNode.bestPath && toNode.bestPath;
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
    const roots = nodes.filter(n => !n.parentId);
    if (roots.length === 0 && nodes.length > 0) {
      roots.push(nodes[0]);
    }

    // BFS to assign levels
    const queue = roots.map(n => ({ node: n, level: 0 }));
    const visited = new Set();

    while (queue.length > 0) {
      const { node, level } = queue.shift();
      if (visited.has(node.id)) continue;
      visited.add(node.id);

      levels[node.id] = level;

      // Find children
      const children = edges.filter(e => e.from === node.id).map(e => nodes.find(n => n.id === e.to)).filter(Boolean);
      children.forEach(child => queue.push({ node: child, level: level + 1 }));
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
