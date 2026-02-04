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

  function parseScore(content) {
    if (!content) return null;

    // Try JSON parse first
    try {
      const json = JSON.parse(content);
      if (json.score !== undefined) return json.score;
      if (json.rating !== undefined) return json.rating;
    } catch {}

    // Try regex patterns
    const patterns = [
      /score[:\s]+(\d+)/i,
      /(\d+)\s*\/\s*10/,
      /rating[:\s]+(\d+)/i,
      /점수[:\s]*(\d+)/,
      /평가[:\s]*(\d+)/
    ];

    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        const score = parseInt(match[1]);
        if (score >= 0 && score <= 10) return score;
      }
    }

    return null;
  }

  function parseReviewContent(content) {
    if (!content) return { issues: [], comments: [] };

    const result = { issues: [], comments: [] };

    // Try JSON parse first
    try {
      const json = JSON.parse(content);
      if (json.issues) {
        const issues = Array.isArray(json.issues) ? json.issues : [json.issues];
        result.issues = issues.map(issue => typeof issue === 'object' ? (issue.description || JSON.stringify(issue)) : String(issue));
      }
      if (json.comments) {
        const comments = Array.isArray(json.comments) ? json.comments : [json.comments];
        result.comments = comments.map(comment => typeof comment === 'object' ? (comment.description || comment.text || JSON.stringify(comment)) : String(comment));
      }
      return result;
    } catch {}

    // Parse plain text - split by lines
    const lines = content.split('\n').map(l => l.trim()).filter(l => l);

    // Look for issue markers
    for (const line of lines) {
      if (line.match(/^[-•*]\s+/) || line.match(/issue|problem|warning|error/i)) {
        result.issues.push(line.replace(/^[-•*]\s+/, ''));
      } else if (line.match(/comment|note|suggestion|개선/i)) {
        result.comments.push(line.replace(/^[-•*]\s+/, ''));
      } else if (line.length > 10) {
        // Default to comments for substantial text
        result.comments.push(line);
      }
    }

    // If no structured content, add the whole text as a comment
    if (result.issues.length === 0 && result.comments.length === 0 && content.length > 0) {
      result.comments.push(content);
    }

    return result;
  }

  function handleStep(step) {
    allSteps.push(step);

    // Update token counter if present
    if (step.tokenUsage) {
      updateTokenCounter(step.tokenUsage);
    }

    if (step.type === 'review_start') {
      // Mark category as reviewing
      if (step.category) {
        updateCardStatus(step.category, 'reviewing');
        const body = document.getElementById(`review-body-${step.category}`);
        if (body) {
          body.innerHTML = '<p class="text-gray-500 text-sm">분석 중...</p>';
        }
      }
    } else if (step.type === 'review_category') {
      // Category is being analyzed - show progress
      if (step.category) {
        updateCardStatus(step.category, 'reviewing');
        const body = document.getElementById(`review-body-${step.category}`);
        if (body) {
          body.innerHTML = '<p class="text-blue-500 text-sm font-semibold animate-pulse">분석 중...</p>';
        }
      }
    } else if (step.type === 'review_complete') {
      // Store review results
      if (step.category && step.content) {
        const score = parseScore(step.content);
        const parsed = parseReviewContent(step.content);

        reviews[step.category] = {
          score: score,
          issues: parsed.issues,
          comments: parsed.comments,
          rawContent: step.content
        };

        updateReviewCard(step.category, reviews[step.category]);
        updateCardStatus(step.category, 'complete');
      }
    } else if (step.type === 'summary' || step.type === 'final') {
      // Show overall summary
      const overallScore = parseScore(step.content);
      renderSummary(step, overallScore);
    }
  }

  function updateTokenCounter(tokenUsage) {
    const counterEl = document.getElementById('code-review-token-counter');
    if (!counterEl) return;

    const total = (tokenUsage.input || 0) + (tokenUsage.output || 0);
    counterEl.textContent = `토큰: ${total.toLocaleString()}`;
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
      statusEl.textContent = '분석 중...';
      statusEl.classList.add('status-reviewing');
    } else if (status === 'complete') {
      const review = reviews[category];
      if (review && review.score !== null && review.score !== undefined) {
        statusEl.textContent = `완료 (${review.score}/10)`;
      } else {
        statusEl.textContent = '완료 ✓';
      }
      statusEl.classList.add('status-complete');
    } else {
      statusEl.textContent = '대기중';
      statusEl.classList.add('status-pending');
    }
  }

  function updateReviewCard(category, review) {
    const body = document.getElementById(`review-body-${category}`);
    if (!body) return;

    // Handle score display
    let scoreBadge = '';
    if (review.score !== null && review.score !== undefined) {
      const scoreColor = getScoreColor(review.score);
      scoreBadge = `<div class="score-badge" style="background: ${scoreColor};">${review.score}/10</div>`;
    } else {
      // No score found - show checkmark
      scoreBadge = `<div class="score-badge" style="background: #10b981;">✓ 완료</div>`;
    }

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

    // If no structured content, show raw content
    const contentHtml = (!issuesHtml && !commentsHtml && review.rawContent)
      ? `<div class="mt-3 text-sm text-gray-700 whitespace-pre-wrap">${escapeHtml(review.rawContent)}</div>`
      : '';

    body.innerHTML = `
      ${scoreBadge}
      ${issuesHtml}
      ${commentsHtml}
      ${contentHtml}
    `;
  }

  function renderSummary(step, parsedOverallScore) {
    const overallScore = parsedOverallScore || step.overallScore || calculateOverallScore();
    const scoreColor = getScoreColor(overallScore);

    // Extract summary text from step.content or step.summary
    const summaryText = step.summary || (step.content && typeof step.content === 'string' ? step.content : '');

    summaryPanel.innerHTML = `
      <div class="p-4">
        <div class="flex items-center justify-between mb-4">
          <h3 class="font-semibold text-lg">종합 평가</h3>
          ${overallScore !== null && overallScore !== undefined ? `
            <div class="overall-score-badge" style="background: ${scoreColor};">
              ${overallScore.toFixed(1)}/10
            </div>
          ` : ''}
        </div>
        ${summaryText ? `
          <p class="text-gray-700 mb-3 whitespace-pre-wrap">${escapeHtml(summaryText)}</p>
        ` : ''}
        <div class="grid grid-cols-2 gap-2 text-sm">
          ${REVIEW_CATEGORIES.map(cat => {
            const review = reviews[cat.id];
            if (!review) return '';
            const scoreDisplay = review.score !== null && review.score !== undefined
              ? `${review.score}/10`
              : '✓';
            return `
              <div class="flex items-center justify-between p-2 bg-gray-50 rounded">
                <span>${cat.name}</span>
                <span class="font-semibold" style="color: ${cat.color};">${scoreDisplay}</span>
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

/**
 * Initialize Code Review pattern diagram (slide 14)
 */
function initCodeReviewDiagram() {
  const diagramContainer = document.getElementById('code-review-diagram');
  if (!diagramContainer) return;

  diagramContainer.innerHTML = `
    <svg viewBox="0 0 800 600" xmlns="http://www.w3.org/2000/svg" style="width: 100%; height: auto; max-width: 800px; margin: 0 auto; display: block;">
      <defs>
        <marker id="arrowhead-code-review" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#1a1a2a" />
        </marker>
      </defs>

      <!-- Code Input (Top) -->
      <rect x="300" y="20" width="200" height="60" rx="8" fill="#ffffff" stroke="#1a1a2a" stroke-width="2"/>
      <text x="400" y="45" text-anchor="middle" font-size="16" font-weight="600" fill="#1a1a2a">코드 입력</text>
      <text x="400" y="65" text-anchor="middle" font-size="13" fill="#6b7280">Code Input</text>

      <!-- Fan-out arrows to 4 reviewers -->
      <path d="M 400 80 L 150 180" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 400 80 L 300 180" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 400 80 L 500 180" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 400 80 L 650 180" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>

      <!-- Parallel Reviewers (4 nodes at same vertical level) -->
      <!-- Security Reviewer (Red) -->
      <rect x="50" y="180" width="200" height="70" rx="8" fill="#ffffff" stroke="#ef4444" stroke-width="3"/>
      <text x="150" y="210" text-anchor="middle" font-size="15" font-weight="600" fill="#1a1a2a">보안 리뷰어</text>
      <text x="150" y="230" text-anchor="middle" font-size="12" fill="#6b7280">Security Reviewer</text>

      <!-- Performance Reviewer (Blue) -->
      <rect x="200" y="180" width="200" height="70" rx="8" fill="#ffffff" stroke="#3b82f6" stroke-width="3"/>
      <text x="300" y="210" text-anchor="middle" font-size="15" font-weight="600" fill="#1a1a2a">성능 리뷰어</text>
      <text x="300" y="230" text-anchor="middle" font-size="12" fill="#6b7280">Performance</text>

      <!-- Style Reviewer (Purple) -->
      <rect x="400" y="180" width="200" height="70" rx="8" fill="#ffffff" stroke="#8b5cf6" stroke-width="3"/>
      <text x="500" y="210" text-anchor="middle" font-size="15" font-weight="600" fill="#1a1a2a">스타일 리뷰어</text>
      <text x="500" y="230" text-anchor="middle" font-size="12" fill="#6b7280">Style Reviewer</text>

      <!-- Logic Reviewer (Green) -->
      <rect x="550" y="180" width="200" height="70" rx="8" fill="#ffffff" stroke="#10b981" stroke-width="3"/>
      <text x="650" y="210" text-anchor="middle" font-size="15" font-weight="600" fill="#1a1a2a">로직 리뷰어</text>
      <text x="650" y="230" text-anchor="middle" font-size="12" fill="#6b7280">Logic Reviewer</text>

      <!-- Feedback labels -->
      <text x="150" y="270" text-anchor="middle" font-size="11" fill="#6b7280" font-style="italic">보안 피드백</text>
      <text x="300" y="270" text-anchor="middle" font-size="11" fill="#6b7280" font-style="italic">성능 피드백</text>
      <text x="500" y="270" text-anchor="middle" font-size="11" fill="#6b7280" font-style="italic">스타일 피드백</text>
      <text x="650" y="270" text-anchor="middle" font-size="11" fill="#6b7280" font-style="italic">로직 피드백</text>

      <!-- Convergence arrows to Summarizer -->
      <path d="M 150 280 L 350 380" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 300 280 L 370 380" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 500 280 L 430 380" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>
      <path d="M 650 280 L 450 380" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>

      <!-- Summarizer (Gold) -->
      <rect x="300" y="380" width="200" height="70" rx="8" fill="#ffffff" stroke="#d97706" stroke-width="3"/>
      <text x="400" y="410" text-anchor="middle" font-size="15" font-weight="600" fill="#1a1a2a">종합 분석기</text>
      <text x="400" y="430" text-anchor="middle" font-size="12" fill="#6b7280">Summarizer</text>

      <!-- Arrow to Final Output -->
      <path d="M 400 450 L 400 510" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead-code-review)"/>

      <!-- Final Summary Output (Bottom) -->
      <rect x="300" y="510" width="200" height="60" rx="8" fill="#ffffff" stroke="#1a1a2a" stroke-width="2"/>
      <text x="400" y="535" text-anchor="middle" font-size="16" font-weight="600" fill="#1a1a2a">종합 리뷰 결과</text>
      <text x="400" y="555" text-anchor="middle" font-size="13" fill="#6b7280">Final Summary</text>

      <!-- Parallel execution indicator -->
      <rect x="20" y="195" width="10" height="40" rx="2" fill="#f59e0b" opacity="0.3"/>
      <text x="12" y="220" text-anchor="end" font-size="11" font-weight="600" fill="#f59e0b" transform="rotate(-90, 12, 220)">병렬 처리</text>
    </svg>
  `;
}

// Initialize diagram - call immediately if DOM already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCodeReviewDiagram);
} else {
  initCodeReviewDiagram();
}
