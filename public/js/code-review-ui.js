/**
 * Code Review Demo UI
 * Vanilla JavaScript - no modules
 */

window.codeReviewResults = null;

// Sample code for review
const REVIEW_SAMPLES = [
  {
    label: "SQL Injection",
    code: `def process_user_data(user_input):
    query = "SELECT * FROM users WHERE id = " + user_input
    result = db.execute(query)
    return result`
  },
  {
    label: "O(n²) duplicates",
    code: `function findDuplicates(arr) {
  var duplicates = [];
  for (var i = 0; i < arr.length; i++) {
    for (var j = 0; j < arr.length; j++) {
      if (i != j && arr[i] == arr[j]) {
        duplicates.push(arr[i]);
      }
    }
  }
  return duplicates;
}`
  },
  {
    label: "Resource leak",
    code: `public class FileProcessor {
  public String readFile(String path) {
    FileReader reader = new FileReader(path);
    BufferedReader br = new BufferedReader(reader);
    String content = br.readLine();
    return content;
  }
}`
  }
];

// Review categories
const REVIEW_CATEGORIES = [
  { id: 'correctness', name: '정확성', icon: '✓', color: '#3b82f6' },
  { id: 'style', name: '스타일', icon: '✨', color: '#8b5cf6' },
  { id: 'performance', name: '성능', icon: '⚡', color: '#f59e0b' },
  { id: 'security', name: '보안', icon: '🔒', color: '#ef4444' }
];

/**
 * Initialize Code Review demo on slide 15
 */
function initCodeReviewDemo() {
  const codeInput = document.getElementById('code-review-input');
  const sendBtn = document.getElementById('code-review-send');
  const reviewGrid = document.getElementById('code-review-grid');
  const summaryPanel = document.getElementById('code-review-summary');

  if (!codeInput || !sendBtn || !reviewGrid || !summaryPanel) return;

  let abortController = null;
  let allSteps = [];
  let reviews = {};

  // Pre-populate with first sample
  if (REVIEW_SAMPLES.length > 0) {
    codeInput.value = REVIEW_SAMPLES[0].code;
  }

  // Initialize review cards
  initializeReviewCards();

  async function submit() {
    const code = codeInput.value.trim();
    if (!code) return;

    // Reset state
    reviews = {};
    allSteps = [];
    resetReviewCards();
    summaryPanel.innerHTML = '<p class="text-gray-500">분석 중...</p>';
    codeInput.disabled = true;
    sendBtn.disabled = true;

    abortController = new AbortController();

    try {
      const response = await fetch('/api/code-review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
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
      window.codeReviewResults = { steps: allSteps, reviews };

      // Dispatch results event
      document.dispatchEvent(new CustomEvent('results-updated', {
        detail: { patternType: 'code-review', steps: allSteps }
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      summaryPanel.innerHTML = `<p class="text-red-600">${err.message || '오류가 발생했습니다'}</p>`;
    } finally {
      codeInput.disabled = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  function handleStep(step) {
    allSteps.push(step);

    if (step.type === 'review_start') {
      // Mark category as reviewing
      if (step.category) {
        updateCardStatus(step.category, 'reviewing');
      }
    } else if (step.type === 'review_category') {
      // Store review results
      if (step.category) {
        reviews[step.category] = {
          score: step.score,
          issues: step.issues || [],
          comments: step.comments || []
        };
        updateReviewCard(step.category, reviews[step.category]);
        updateCardStatus(step.category, 'complete');
      }
    } else if (step.type === 'summary') {
      // Show overall summary
      renderSummary(step);
    } else if (step.type === 'final') {
      // All reviews complete
    }
  }

  function initializeReviewCards() {
    reviewGrid.innerHTML = REVIEW_CATEGORIES.map(cat => `
      <div class="review-card" id="review-card-${cat.id}" data-category="${cat.id}">
        <div class="review-card-header" style="border-left: 4px solid ${cat.color};">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span class="text-2xl">${cat.icon}</span>
              <h3 class="font-semibold">${cat.name}</h3>
            </div>
            <span class="review-status" id="status-${cat.id}">대기중</span>
          </div>
        </div>
        <div class="review-card-body" id="review-body-${cat.id}">
          <p class="text-gray-500 text-sm">분석 대기중...</p>
        </div>
      </div>
    `).join('');
  }

  function resetReviewCards() {
    REVIEW_CATEGORIES.forEach(cat => {
      updateCardStatus(cat.id, 'pending');
      const body = document.getElementById(`review-body-${cat.id}`);
      if (body) {
        body.innerHTML = '<p class="text-gray-500 text-sm">분석 대기중...</p>';
      }
    });
  }

  function updateCardStatus(category, status) {
    const statusEl = document.getElementById(`status-${category}`);
    if (!statusEl) return;

    statusEl.className = 'review-status';
    if (status === 'reviewing') {
      statusEl.textContent = '분석중';
      statusEl.classList.add('status-reviewing');
    } else if (status === 'complete') {
      statusEl.textContent = '완료';
      statusEl.classList.add('status-complete');
    } else {
      statusEl.textContent = '대기중';
      statusEl.classList.add('status-pending');
    }
  }

  function updateReviewCard(category, review) {
    const body = document.getElementById(`review-body-${category}`);
    if (!body) return;

    const scoreColor = getScoreColor(review.score);
    const scoreBadge = `<div class="score-badge" style="background: ${scoreColor};">${review.score}/10</div>`;

    const issuesHtml = review.issues && review.issues.length > 0
      ? `<div class="mt-3">
          <p class="text-sm font-semibold mb-2">발견된 이슈:</p>
          <ul class="text-sm space-y-1">
            ${review.issues.map(issue => `
              <li class="flex items-start gap-2">
                <span class="text-red-500 mt-0.5">•</span>
                <span>${escapeHtml(issue)}</span>
              </li>
            `).join('')}
          </ul>
        </div>`
      : '';

    const commentsHtml = review.comments && review.comments.length > 0
      ? `<div class="mt-3">
          <p class="text-sm font-semibold mb-2">코멘트:</p>
          <ul class="text-sm space-y-1">
            ${review.comments.map(comment => `
              <li class="flex items-start gap-2">
                <span class="text-blue-500 mt-0.5">💬</span>
                <span>${escapeHtml(comment)}</span>
              </li>
            `).join('')}
          </ul>
        </div>`
      : '';

    body.innerHTML = `
      ${scoreBadge}
      ${issuesHtml}
      ${commentsHtml}
    `;
  }

  function renderSummary(step) {
    const overallScore = step.overallScore || calculateOverallScore();
    const scoreColor = getScoreColor(overallScore);

    summaryPanel.innerHTML = `
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-lg">종합 평가</h3>
          <div class="overall-score-badge" style="background: ${scoreColor};">
            ${overallScore.toFixed(1)}/10
          </div>
        </div>
        ${step.summary ? `
          <p class="text-gray-700 mb-3">${escapeHtml(step.summary)}</p>
        ` : ''}
        <div class="grid grid-cols-2 gap-2 text-sm">
          ${REVIEW_CATEGORIES.map(cat => {
            const review = reviews[cat.id];
            if (!review) return '';
            return `
              <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span>${cat.name}</span>
                <span class="font-semibold" style="color: ${cat.color};">${review.score}/10</span>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  function calculateOverallScore() {
    const scores = Object.values(reviews).map(r => r.score).filter(s => s !== undefined);
    if (scores.length === 0) return 0;
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  function getScoreColor(score) {
    if (score >= 8) return '#10b981'; // green
    if (score >= 6) return '#3b82f6'; // blue
    if (score >= 4) return '#f59e0b'; // orange
    return '#ef4444'; // red
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event listeners
  sendBtn.addEventListener('click', submit);

  // Sample code buttons
  document.querySelectorAll('.code-review-sample').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      if (REVIEW_SAMPLES[idx]) {
        codeInput.value = REVIEW_SAMPLES[idx].code;
      }
    });
  });

  // Add code styling
  codeInput.style.fontFamily = 'monospace';
  codeInput.style.fontSize = '14px';
  codeInput.style.lineHeight = '1.5';

  // Create results viewer for slide 16
  const resultsViewer = createResultsViewer('code-review-results', 'code-review');

  return { resultsViewer };
}
