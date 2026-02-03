/**
 * Code Review Results Viewer
 */

function initCodeReviewResults() {
  const container = document.getElementById('code-review-results');
  if (!container) return;

  const results = window.codeReviewResults;
  if (!results || !results.steps) {
    container.innerHTML = `
      <div class="results-placeholder">
        <div class="results-placeholder-icon">📝</div>
        <p>먼저 데모를 실행해주세요.</p>
        <p class="text-sm text-gray-500">슬라이드 15에서 코드 리뷰 데모를 실행한 후 결과를 확인할 수 있습니다.</p>
      </div>
    `;
    return;
  }

  // Extract data from steps
  const reviews = {};
  let summary = null;
  let totalTokens = { prompt: 0, completion: 0 };

  results.steps.forEach(step => {
    if (step.type === 'review_complete' && step.category) {
      reviews[step.category] = {
        content: step.content,
        score: step.data?.score
      };
    } else if (step.type === 'final') {
      summary = step.content;
    }
    if (step.tokenUsage) {
      totalTokens.prompt += step.tokenUsage.prompt_tokens || 0;
      totalTokens.completion += step.tokenUsage.completion_tokens || 0;
    }
  });

  // Also check results.reviews if available
  if (results.reviews) {
    Object.entries(results.reviews).forEach(([cat, data]) => {
      reviews[cat] = data;
    });
  }

  const categories = [
    { id: 'correctness', name: '정확성', icon: '✓', color: '#3b82f6' },
    { id: 'style', name: '스타일', icon: '✨', color: '#8b5cf6' },
    { id: 'performance', name: '성능', icon: '⚡', color: '#f59e0b' },
    { id: 'security', name: '보안', icon: '🔒', color: '#ef4444' }
  ];

  // Calculate overall score
  const scores = Object.values(reviews).map(r => r.score).filter(s => s !== undefined);
  const overallScore = scores.length > 0 ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 'N/A';

  // Build score breakdown bars
  const scoreBarsHtml = categories.map(cat => {
    const review = reviews[cat.id];
    const score = review?.score || 0;
    const width = (score / 10) * 100;
    return `
      <div class="score-bar">
        <div class="score-bar-label flex justify-between">
          <span>${cat.name}</span>
          <span class="font-medium">${score}/10</span>
        </div>
        <div class="score-bar-track">
          <div class="score-bar-fill ${cat.id}" style="width: ${width}%;"></div>
        </div>
      </div>
    `;
  }).join('');

  // Build review details
  const reviewsHtml = categories.map(cat => {
    const review = reviews[cat.id];
    if (!review) return '';
    return `
      <div class="mb-4 p-4 bg-gray-50 rounded-lg border-l-4" style="border-color: ${cat.color};">
        <div class="flex items-center justify-between mb-2">
          <h4 class="font-semibold flex items-center gap-2">
            <span>${cat.icon}</span>
            <span>${cat.name} 검토</span>
          </h4>
          <span class="px-2 py-1 rounded text-sm font-medium" style="background: ${getScoreColor(review.score)}; color: white;">
            ${review.score}/10
          </span>
        </div>
        <div class="text-sm text-gray-700 whitespace-pre-wrap">${escapeHtml(truncate(review.content || '', 300))}</div>
      </div>
    `;
  }).join('');

  container.innerHTML = `
    <div class="results-content p-4">
      <h3 class="text-xl font-semibold mb-4">코드 리뷰 분석</h3>

      <div class="mb-6 p-4 bg-gray-50 rounded-lg">
        <div class="flex items-center justify-between mb-4">
          <h4 class="font-semibold">종합 점수</h4>
          <div class="text-3xl font-bold" style="color: ${getScoreColor(parseFloat(overallScore) || 0)};">${overallScore}/10</div>
        </div>
        <div class="score-breakdown space-y-3">
          ${scoreBarsHtml}
        </div>
      </div>

      <div class="mb-6">
        <h4 class="font-semibold mb-2">카테고리별 상세</h4>
        ${reviewsHtml || '<p class="text-gray-500">리뷰 결과가 없습니다</p>'}
      </div>

      ${summary ? `
        <div class="mb-6">
          <h4 class="font-semibold mb-2">종합 평가</h4>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(summary)}</p>
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
