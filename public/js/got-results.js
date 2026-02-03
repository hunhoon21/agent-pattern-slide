/**
 * Graph of Thoughts Results Viewer
 */

function initGotResults() {
  const container = document.getElementById('got-results');
  if (!container) return;

  const results = window.gotResults;
  if (!results || !results.steps) {
    container.innerHTML = `
      <div class="results-placeholder">
        <div class="results-placeholder-icon">📊</div>
        <p>먼저 데모를 실행해주세요.</p>
        <p class="text-sm text-gray-500">슬라이드 9에서 그래프 오브 소트 데모를 실행한 후 결과를 확인할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  // Extract thought graph data from steps
  const thoughtNodes = [];
  const evaluations = [];
  let synthesis = null;
  let totalTokens = { prompt: 0, completion: 0 };

  results.steps.forEach(step => {
    if (step.type === 'thought_node') {
      thoughtNodes.push({
        id: step.data?.thought_id,
        parentId: step.data?.parent_id,
        level: step.data?.level || 0,
        content: step.content,
        score: step.data?.score
      });
    } else if (step.type === 'evaluation') {
      evaluations.push(step.data);
    } else if (step.type === 'final') {
      synthesis = step.content;
      if (step.data?.thought_graph) {
        // Use complete graph from final step
        thoughtNodes.length = 0;
        step.data.thought_graph.forEach(t => thoughtNodes.push(t));
      }
    }
    if (step.tokenUsage) {
      totalTokens.prompt += step.tokenUsage.prompt_tokens || 0;
      totalTokens.completion += step.tokenUsage.completion_tokens || 0;
    }
  });

  // Build tree structure for display
  const buildTree = (nodes, parentId = null, depth = 0) => {
    return nodes
      .filter(n => n.parentId === parentId || (parentId === null && n.parent_id === undefined))
      .map(node => {
        const children = buildTree(nodes, node.id, depth + 1);
        const scoreColor = getScoreColor(node.score);
        return `
          <div class="tree-node" style="margin-left: ${depth * 20}px;">
            <div class="tree-node-content p-3 rounded border border-gray-200 mb-2">
              <div class="flex items-center justify-between mb-2">
                <span class="font-semibold">사고 ${node.id}</span>
                ${node.score !== undefined ? `<span class="px-2 py-1 rounded text-xs font-medium" style="background: ${scoreColor}; color: white;">점수: ${node.score}</span>` : ''}
              </div>
              <p class="text-sm text-gray-700 whitespace-pre-wrap">${escapeHtml(truncate(node.content || '', 200))}</p>
            </div>
            ${children.length > 0 ? `<div class="tree-children">${children.join('')}</div>` : ''}
          </div>
        `;
      }).join('');
  };

  const treeHtml = buildTree(thoughtNodes);

  container.innerHTML = `
    <div class="results-content p-4">
      <h3 class="text-xl font-semibold mb-4">사고 그래프 분석</h3>

      <div class="mb-6">
        <h4 class="font-semibold mb-2">사고 경로</h4>
        <div class="results-tree bg-gray-50 rounded-lg p-4 max-h-64 overflow-y-auto">
          ${treeHtml || '<p class="text-gray-500">사고 노드가 없습니다</p>'}
        </div>
      </div>

      ${synthesis ? `
        <div class="mb-6">
          <h4 class="font-semibold mb-2">합성 결과</h4>
          <div class="bg-green-50 border border-green-200 rounded-lg p-4">
            <p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(synthesis)}</p>
          </div>
        </div>
      ` : ''}

      <div class="token-usage-breakdown">
        <h4 class="font-semibold mb-2">토큰 사용량</h4>
        <div class="grid grid-cols-3 gap-4">
          <div class="token-usage-item">
            <div class="agent-name">입력 토큰</div>
            <div class="token-count">${totalTokens.prompt.toLocaleString()}</div>
          </div>
          <div class="token-usage-item">
            <div class="agent-name">출력 토큰</div>
            <div class="token-count">${totalTokens.completion.toLocaleString()}</div>
          </div>
          <div class="token-usage-item">
            <div class="agent-name">총 토큰</div>
            <div class="token-count">${(totalTokens.prompt + totalTokens.completion).toLocaleString()}</div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function getScoreColor(score) {
  if (score === undefined) return '#6b7280';
  if (score >= 8) return '#10b981';
  if (score >= 6) return '#3b82f6';
  if (score >= 4) return '#f59e0b';
  return '#ef4444';
}

function truncate(text, maxLen) {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
