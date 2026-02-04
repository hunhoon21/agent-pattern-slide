/**
 * Rich Feedback Loop Demo UI
 * Vanilla JavaScript - no modules
 */

window.richFeedbackResults = null;

// Sample code snippets
const SAMPLE_CODES = [
  {
    label: "Division by zero",
    code: `def calculate_average(numbers):
    total = 0
    for num in numbers:
        total += num
    return total / len(numbers)`
  },
  {
    label: "Resource leak",
    code: `def read_config(filename):
    f = open(filename, 'r')
    data = f.read()
    config = json.loads(data)
    return config`
  },
  {
    label: "SQL Injection",
    code: `def get_user(user_id):
    query = "SELECT * FROM users WHERE id = " + user_id
    cursor.execute(query)
    return cursor.fetchone()`
  }
];

/**
 * Initialize Rich Feedback demo on slide 12
 */
function initRichFeedbackDemo() {
  const codeInput = document.getElementById('rich-feedback-code');
  const sendBtn = document.getElementById('rich-feedback-send');
  const issuesPanel = document.getElementById('rich-feedback-issues');
  const iterationDisplay = document.getElementById('rich-feedback-iteration');

  if (!codeInput || !sendBtn || !issuesPanel || !iterationDisplay) return;

  let abortController = null;
  let allSteps = [];
  let currentIteration = 0;
  let issues = [];

  // Pre-populate with first sample
  if (SAMPLE_CODES.length > 0) {
    codeInput.value = SAMPLE_CODES[0].code;
  }

  async function submit() {
    const code = codeInput.value.trim();
    if (!code) return;

    // Reset state
    issues = [];
    currentIteration = 0;
    allSteps = [];
    issuesPanel.innerHTML = '<p class="text-gray-500">분석 중...</p>';
    iterationDisplay.textContent = '0/3';
    codeInput.disabled = true;
    sendBtn.disabled = true;

    abortController = new AbortController();

    try {
      const response = await fetch('/api/rich-feedback', {
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
      window.richFeedbackResults = { steps: allSteps };

      // Dispatch results event
      document.dispatchEvent(new CustomEvent('results-updated', {
        detail: { patternType: 'rich-feedback', steps: allSteps }
      }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      issuesPanel.innerHTML = `<p class="text-red-600">${err.message || '오류가 발생했습니다'}</p>`;
    } finally {
      codeInput.disabled = false;
      sendBtn.disabled = false;
      abortController = null;
    }
  }

  function handleStep(step) {
    allSteps.push(step);

    if (step.type === 'analysis') {
      currentIteration = step.iteration || 1;
      iterationDisplay.textContent = `${currentIteration}/3`;

      if (step.issues) {
        issues = step.issues;
        renderIssues();
      }
    } else if (step.type === 'fix_attempt') {
      // Update code display
      if (step.fixedCode) {
        codeInput.value = step.fixedCode;
        addCodeLineNumbers();
      }

      // Mark issue as fixed
      if (step.issueId !== undefined) {
        const issue = issues.find(i => i.id === step.issueId);
        if (issue) {
          issue.status = 'fixing';
          renderIssues();
        }
      }
    } else if (step.type === 'validation') {
      // Update issue status based on validation
      if (step.issueId !== undefined) {
        const issue = issues.find(i => i.id === step.issueId);
        if (issue) {
          issue.status = step.passed ? 'fixed' : 'failed';
          issue.validationMessage = step.message;
          renderIssues();
        }
      }
    } else if (step.type === 'final') {
      // Show final result
      if (step.fixedCode) {
        codeInput.value = step.fixedCode;
        addCodeLineNumbers();
      }
    }
  }

  function renderIssues() {
    if (issues.length === 0) {
      issuesPanel.innerHTML = '<p class="text-gray-500">이슈가 발견되지 않았습니다</p>';
      return;
    }

    issuesPanel.innerHTML = issues.map((issue) => `
      <div class="issue-card mb-3 p-3 rounded-lg border ${getIssueCardClass(issue)}">
        <div class="flex items-start justify-between mb-2">
          <div class="flex-1">
            <div class="flex items-center gap-2 mb-1">
              <span class="issue-severity ${getSeverityClass(issue.severity)}">${getSeverityLabel(issue.severity)}</span>
              <span class="issue-status ${getStatusClass(issue.status)}">${getStatusLabel(issue.status)}</span>
            </div>
            <h4 class="font-semibold text-sm">${escapeHtml(issue.title || issue.message)}</h4>
          </div>
        </div>
        ${issue.line ? `<p class="text-xs text-gray-600 mb-1">Line ${issue.line}</p>` : ''}
        <p class="text-sm text-gray-700">${escapeHtml(issue.description || issue.message)}</p>
        ${issue.validationMessage ? `<p class="text-xs mt-2 text-gray-600">${escapeHtml(issue.validationMessage)}</p>` : ''}
      </div>
    `).join('');
  }

  function getIssueCardClass(issue) {
    if (issue.status === 'fixed') return 'border-green-300 bg-green-50';
    if (issue.status === 'fixing') return 'border-blue-300 bg-blue-50';
    if (issue.status === 'failed') return 'border-red-300 bg-red-50';
    return 'border-gray-300 bg-white';
  }

  function getSeverityClass(severity) {
    const sev = (severity || 'info').toLowerCase();
    if (sev === 'critical' || sev === 'error') return 'severity-critical';
    if (sev === 'warning') return 'severity-warning';
    return 'severity-info';
  }

  function getSeverityLabel(severity) {
    const sev = (severity || 'info').toLowerCase();
    if (sev === 'critical') return '심각';
    if (sev === 'error') return '오류';
    if (sev === 'warning') return '경고';
    return '정보';
  }

  function getStatusClass(status) {
    if (!status || status === 'pending') return 'status-pending';
    if (status === 'fixing') return 'status-fixing';
    if (status === 'fixed') return 'status-fixed';
    if (status === 'failed') return 'status-failed';
    return 'status-pending';
  }

  function getStatusLabel(status) {
    if (!status || status === 'pending') return '대기중';
    if (status === 'fixing') return '수정중';
    if (status === 'fixed') return '완료';
    if (status === 'failed') return '실패';
    return '대기중';
  }

  function addCodeLineNumbers() {
    // This could be enhanced with a proper code editor library
    // For now, just ensure the textarea is readable
    codeInput.style.fontFamily = 'monospace';
    codeInput.style.fontSize = '14px';
    codeInput.style.lineHeight = '1.5';
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Event listeners
  sendBtn.addEventListener('click', submit);

  // Sample code buttons
  document.querySelectorAll('.rich-feedback-sample').forEach((btn, idx) => {
    btn.addEventListener('click', () => {
      if (SAMPLE_CODES[idx]) {
        codeInput.value = SAMPLE_CODES[idx].code;
        addCodeLineNumbers();
      }
    });
  });

  // Add initial line numbers
  addCodeLineNumbers();

  // Create results viewer for slide 13
  // @ts-ignore - createResultsViewer is defined in results-viewer.js
  const resultsViewer = createResultsViewer('rich-feedback-results', 'rich-feedback');

  return { resultsViewer };
}

/**
 * Initialize Rich Feedback diagram on slide 11
 */
function initRichFeedbackDiagram() {
  const diagramContainer = document.getElementById('rich-feedback-diagram');
  if (!diagramContainer) return;

  diagramContainer.innerHTML = `
    <svg width="700" height="520" viewBox="0 0 700 520" xmlns="http://www.w3.org/2000/svg">
      <!-- User Input -->
      <rect x="250" y="20" width="200" height="60" rx="8" fill="#ffffff" stroke="#1a1a2a" stroke-width="2"/>
      <text x="350" y="45" text-anchor="middle" font-size="14" fill="#1a1a2a" font-weight="600">사용자 입력</text>
      <text x="350" y="65" text-anchor="middle" font-size="12" fill="#666" font-style="italic">User Input</text>

      <!-- Arrow: Input → Analyzer -->
      <path d="M 350 80 L 350 130" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>

      <!-- Analyzer Node -->
      <rect x="250" y="130" width="200" height="70" rx="8" fill="#3b82f6" fill-opacity="0.1" stroke="#3b82f6" stroke-width="2"/>
      <text x="350" y="155" text-anchor="middle" font-size="14" fill="#1a1a2a" font-weight="600">분석기 (Analyzer)</text>
      <text x="350" y="173" text-anchor="middle" font-size="11" fill="#666">구조화된 피드백 생성</text>
      <text x="350" y="188" text-anchor="middle" font-size="11" fill="#666" font-style="italic">Structured Feedback</text>

      <!-- Arrow: Analyzer → Fixer -->
      <path d="M 350 200 L 350 240" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>

      <!-- Fixer Node -->
      <rect x="250" y="240" width="200" height="70" rx="8" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="2"/>
      <text x="350" y="265" text-anchor="middle" font-size="14" fill="#1a1a2a" font-weight="600">수정기 (Fixer)</text>
      <text x="350" y="283" text-anchor="middle" font-size="11" fill="#666">피드백 기반 수정</text>
      <text x="350" y="298" text-anchor="middle" font-size="11" fill="#666" font-style="italic">Apply Fixes</text>

      <!-- Arrow: Fixer → Validator -->
      <path d="M 350 310 L 350 350" stroke="#1a1a2a" stroke-width="2" fill="none" marker-end="url(#arrowhead)"/>

      <!-- Validator Node -->
      <rect x="250" y="350" width="200" height="70" rx="8" fill="#f97316" fill-opacity="0.1" stroke="#f97316" stroke-width="2"/>
      <text x="350" y="375" text-anchor="middle" font-size="14" fill="#1a1a2a" font-weight="600">검증기 (Validator)</text>
      <text x="350" y="393" text-anchor="middle" font-size="11" fill="#666">수정 결과 검증</text>
      <text x="350" y="408" text-anchor="middle" font-size="11" fill="#666" font-style="italic">Check if Fixed</text>

      <!-- Loop Arrow: Validator → Analyzer (curved back) -->
      <path d="M 250 380 Q 100 300 100 170 Q 100 150 250 160" stroke="#f97316" stroke-width="2.5" fill="none" marker-end="url(#arrowhead-orange)" stroke-dasharray="5,5"/>
      <text x="80" y="270" text-anchor="middle" font-size="12" fill="#f97316" font-weight="600">재분석</text>
      <text x="80" y="285" text-anchor="middle" font-size="10" fill="#f97316" font-style="italic">if not passed</text>

      <!-- Arrow: Validator → Output (when passed) -->
      <path d="M 350 420 L 350 450" stroke="#10b981" stroke-width="2" fill="none" marker-end="url(#arrowhead-green)"/>
      <text x="380" y="440" font-size="11" fill="#10b981" font-weight="600">통과 시</text>

      <!-- Output Node -->
      <rect x="250" y="450" width="200" height="60" rx="8" fill="#10b981" fill-opacity="0.1" stroke="#10b981" stroke-width="2"/>
      <text x="350" y="475" text-anchor="middle" font-size="14" fill="#1a1a2a" font-weight="600">최종 출력</text>
      <text x="350" y="495" text-anchor="middle" font-size="12" fill="#666" font-style="italic">Validated Output</text>

      <!-- Iteration Counter (right side) -->
      <rect x="520" y="240" width="140" height="90" rx="6" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
      <text x="590" y="265" text-anchor="middle" font-size="13" fill="#1a1a2a" font-weight="600">반복 루프</text>
      <text x="590" y="283" text-anchor="middle" font-size="11" fill="#666">Iteration Loop</text>
      <text x="590" y="305" text-anchor="middle" font-size="11" fill="#666">최대 3회 재시도</text>
      <text x="590" y="320" text-anchor="middle" font-size="10" fill="#666" font-style="italic">Max 3 iterations</text>

      <!-- Arrow definitions -->
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#1a1a2a"/>
        </marker>
        <marker id="arrowhead-orange" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#f97316"/>
        </marker>
        <marker id="arrowhead-green" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
          <polygon points="0 0, 10 3, 0 6" fill="#10b981"/>
        </marker>
      </defs>

      <!-- Legend (bottom right) -->
      <g transform="translate(500, 360)">
        <text x="0" y="0" font-size="12" fill="#1a1a2a" font-weight="600">패턴 특징</text>
        <text x="0" y="18" font-size="10" fill="#666">✓ 구조화된 피드백</text>
        <text x="0" y="33" font-size="10" fill="#666">✓ 단계별 검증</text>
        <text x="0" y="48" font-size="10" fill="#666">✓ 반복적 개선</text>
      </g>
    </svg>
  `;
}

// Initialize diagram - call immediately if DOM already loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initRichFeedbackDiagram);
} else {
  initRichFeedbackDiagram();
}
