/**
 * Rich Feedback Results Viewer
 */

function initRichFeedbackResults() {
  const container = document.getElementById('rich-feedback-results');
  if (!container) return;

  const results = window.richFeedbackResults;
  if (!results || !results.steps) {
    container.innerHTML = `
      <div class="results-placeholder">
        <div class="results-placeholder-icon">🔄</div>
        <p>먼저 데모를 실행해주세요.</p>
        <p class="text-sm text-gray-500">슬라이드 12에서 리치 피드백 데모를 실행한 후 결과를 확인할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  // Extract data from steps
  const iterations = [];
  let currentIteration = null;
  let originalCode = '';
  let finalCode = '';
  let totalTokens = { prompt: 0, completion: 0 };

  results.steps.forEach(step => {
    if (step.type === 'analysis') {
      if (currentIteration) iterations.push(currentIteration);
      currentIteration = {
        number: step.iteration || iterations.length + 1,
        analysis: step.content,
        issues: [],
        fix: null,
        validation: null
      };
      // Try to parse issues from analysis
      try {
        const parsed = JSON.parse(step.content);
        if (parsed.issues) currentIteration.issues = parsed.issues;
      } catch (e) { /* ignore */ }
    } else if (step.type === 'fix_attempt' && currentIteration) {
      currentIteration.fix = step.content;
      finalCode = step.content;
    } else if (step.type === 'validation' && currentIteration) {
      currentIteration.validation = step.content;
    } else if (step.type === 'final') {
      finalCode = step.content;
    }
    if (step.tokenUsage) {
      totalTokens.prompt += step.tokenUsage.prompt_tokens || 0;
      totalTokens.completion += step.tokenUsage.completion_tokens || 0;
    }
  });
  if (currentIteration) iterations.push(currentIteration);

  // Build iteration timeline
  const timelineHtml = iterations.map((iter, idx) => `
    <div class="iteration-step flex items-center">
      <div class="iteration-step-dot ${idx < iterations.length - 1 ? 'complete' : 'active'}">${iter.number}</div>
      ${idx < iterations.length - 1 ? '<div class="iteration-connector complete"></div>' : ''}
    </div>
  `).join('');

  // Build iterations detail
  const iterationsHtml = iterations.map(iter => `
    <div class="mb-4 p-4 bg-gray-50 rounded-lg">
      <h4 class="font-semibold mb-2">반복 ${iter.number}</h4>

      <div class="mb-3">
        <p class="text-sm font-medium text-orange-600 mb-1">분석 결과:</p>
        <div class="text-sm text-gray-700 bg-white p-2 rounded border">
          ${iter.issues.length > 0 ? iter.issues.map(issue => `
            <div class="mb-1">• ${escapeHtml(issue.description || issue.message || JSON.stringify(issue))}</div>
          `).join('') : '<p>이슈가 발견되지 않았습니다.</p>'}
        </div>
      </div>

      ${iter.fix ? `
        <div class="mb-3">
          <p class="text-sm font-medium text-blue-600 mb-1">수정된 코드:</p>
          <pre class="text-xs bg-white p-2 rounded border overflow-x-auto">${escapeHtml(iter.fix)}</pre>
        </div>
      ` : ''}

      ${iter.validation ? `
        <div>
          <p class="text-sm font-medium text-green-600 mb-1">검증 결과:</p>
          <div class="text-sm text-gray-700 bg-white p-2 rounded border">${escapeHtml(iter.validation.slice(0, 200))}${iter.validation.length > 200 ? '...' : ''}</div>
        </div>
      ` : ''}
    </div>
  `).join('');

  container.innerHTML = `
    <div class="results-content p-4">
      <h3 class="text-xl font-semibold mb-4">리치 피드백 분석</h3>

      <div class="mb-6">
        <h4 class="font-semibold mb-2">반복 타임라인</h4>
        <div class="iteration-timeline flex items-center gap-2 p-4 bg-gray-50 rounded-lg">
          ${timelineHtml || '<p class="text-gray-500">반복 정보가 없습니다</p>'}
        </div>
      </div>

      <div class="mb-6">
        <h4 class="font-semibold mb-2">반복별 상세</h4>
        ${iterationsHtml || '<p class="text-gray-500">상세 정보가 없습니다</p>'}
      </div>

      ${finalCode ? `
        <div class="mb-6">
          <h4 class="font-semibold mb-2">최종 코드</h4>
          <pre class="text-sm bg-green-50 border border-green-200 p-4 rounded-lg overflow-x-auto">${escapeHtml(finalCode)}</pre>
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

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
