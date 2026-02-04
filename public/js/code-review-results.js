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
  let summaryData = null;
  let totalTokens = { prompt: 0, completion: 0 };

  results.steps.forEach(step => {
    if (step.type === 'review_complete' && step.category) {
      // Parse score from content
      const score = parseScoreFromContent(step.content);
      reviews[step.category] = {
        content: step.content,
        score: step.data?.score ?? score
      };
    } else if (step.type === 'final') {
      summary = step.content;
      // Try to parse JSON from final step
      summaryData = parseJsonFromContent(step.content);

      // Extract category scores from summary data
      if (summaryData?.category_scores) {
        Object.entries(summaryData.category_scores).forEach(([cat, score]) => {
          if (!reviews[cat]) reviews[cat] = { content: '', score: null };
          reviews[cat].score = score;
        });
      }
    }
    if (step.tokenUsage) {
      totalTokens.prompt += step.tokenUsage.prompt_tokens || 0;
      totalTokens.completion += step.tokenUsage.completion_tokens || 0;
    }
  });

  // Also check results.reviews if available
  if (results.reviews) {
    Object.entries(results.reviews).forEach(([cat, data]) => {
      if (!reviews[cat]) reviews[cat] = {};
      reviews[cat] = { ...reviews[cat], ...data };
    });
  }

  // Helper function to parse score from content
  function parseScoreFromContent(content) {
    if (!content) return null;

    // Try JSON parse first
    try {
      const json = JSON.parse(content);
      if (json.score !== undefined) return json.score;
      if (json.rating !== undefined) return json.rating;
    } catch {}

    // Try regex patterns
    const patterns = [
      /score[:\s]+(\d+(?:\.\d+)?)/i,
      /(\d+(?:\.\d+)?)\s*\/\s*10/,
      /rating[:\s]+(\d+(?:\.\d+)?)/i
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseFloat(match[1]);
        if (score >= 0 && score <= 10) return score;
      }
    }
    return null;
  }

  // Helper function to parse JSON from content
  function parseJsonFromContent(content) {
    if (!content) return null;

    // Try direct parse
    try {
      return JSON.parse(content);
    } catch {}

    // Try to extract JSON from markdown code block
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1].trim());
      } catch {}
    }

    // Try to find JSON object in content
    const objectMatch = content.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      try {
        return JSON.parse(objectMatch[0]);
      } catch {}
    }

    return null;
  }

  const categories = [
    { id: 'correctness', name: '정확성', icon: '✓', color: '#3b82f6' },
    { id: 'style', name: '스타일', icon: '✨', color: '#8b5cf6' },
    { id: 'performance', name: '성능', icon: '⚡', color: '#f59e0b' },
    { id: 'security', name: '보안', icon: '🔒', color: '#ef4444' }
  ];

  // Calculate overall score - prefer summaryData.overall_score if available
  let overallScore = 'N/A';
  if (summaryData?.overall_score !== undefined) {
    overallScore = summaryData.overall_score.toFixed(1);
  } else {
    const scores = Object.values(reviews).map(r => r.score).filter(s => s !== undefined && s !== null);
    if (scores.length > 0) {
      overallScore = (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1);
    }
  }

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

      ${(summaryData || summary) ? `
        <div class="mb-6">
          <h4 class="font-semibold mb-2">종합 평가</h4>
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
            ${renderSummaryContent(summaryData, summary)}
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

function renderSummaryContent(data, rawSummary) {
  if (!data) {
    // No structured data, show raw summary
    return `<p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(rawSummary || '')}</p>`;
  }

  const parts = [];

  // Verdict
  if (data.verdict) {
    const verdictMap = {
      'approved': { label: '승인', color: '#10b981' },
      'needs_changes': { label: '수정 필요', color: '#f59e0b' },
      'rejected': { label: '거부', color: '#ef4444' }
    };
    const v = verdictMap[data.verdict] || { label: data.verdict, color: '#6b7280' };
    parts.push(`<div class="mb-3"><span class="px-3 py-1 rounded-full text-white font-semibold" style="background: ${v.color};">${v.label}</span></div>`);
  }

  // Critical issues
  if (data.critical_issues && data.critical_issues.length > 0) {
    const issuesHtml = data.critical_issues.map(issue =>
      `<li class="flex items-start gap-2"><span class="text-red-500">⚠</span><span>${escapeHtml(issue)}</span></li>`
    ).join('');
    parts.push(`
      <div class="mb-3">
        <p class="font-semibold text-red-600 mb-2">주요 문제점:</p>
        <ul class="space-y-1 text-sm">${issuesHtml}</ul>
      </div>
    `);
  }

  // Recommendations
  if (data.recommendations && data.recommendations.length > 0) {
    const recsHtml = data.recommendations.map(rec =>
      `<li class="flex items-start gap-2"><span class="text-blue-500">💡</span><span>${escapeHtml(rec)}</span></li>`
    ).join('');
    parts.push(`
      <div class="mb-3">
        <p class="font-semibold text-blue-600 mb-2">권장 사항:</p>
        <ul class="space-y-1 text-sm">${recsHtml}</ul>
      </div>
    `);
  }

  // If no structured content rendered, show raw
  if (parts.length === 0 && rawSummary) {
    return `<p class="text-gray-800 whitespace-pre-wrap">${escapeHtml(rawSummary)}</p>`;
  }

  return parts.join('');
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
