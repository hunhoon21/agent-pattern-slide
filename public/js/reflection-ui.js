function initReflectionDemo() {
  // Create chatbot for slide 3
  const chatbot = createChatbot({
    chatAreaId: 'reflection-chat-area',
    inputId: 'reflection-input',
    sendBtnId: 'reflection-send',
    apiEndpoint: '/api/reflection',
    patternType: 'reflection',
    onToken: (data) => {
      // Update iteration counter in sidebar
      const iterEl = document.getElementById('reflection-iteration');
      if (iterEl && data.iteration) {
        iterEl.textContent = data.iteration;
      }
    },
    onStep: (step) => {
      // Update total tokens in sidebar
      if (step.tokenUsage && step.tokenUsage.total_tokens > 0) {
        const tokensEl = document.getElementById('reflection-total-tokens');
        if (tokensEl) {
          const current = parseInt(tokensEl.textContent.replace(/,/g, '')) || 0;
          tokensEl.textContent = (current + step.tokenUsage.total_tokens).toLocaleString('ko-KR');
        }
      }
    }
  });

  // Create results viewer for slide 4
  const resultsViewer = createResultsViewer('reflection-results', 'reflection');

  // Inject SVG diagram into #reflection-diagram
  const diagramContainer = document.getElementById('reflection-diagram');
  if (diagramContainer) {
    diagramContainer.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450" style="display: block; max-height: calc(100vh - 12rem); width: auto;">
        <defs>
          <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#9ca3af" />
          </marker>
          <marker id="arrowhead-feedback" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto">
            <polygon points="0 0, 10 3, 0 6" fill="#f97316" />
          </marker>
        </defs>

        <!-- User Input -->
        <rect x="75" y="20" width="150" height="50" rx="8" fill="transparent" stroke="#d1d5db" stroke-width="2"/>
        <text x="150" y="50" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">사용자 입력</text>

        <!-- Arrow to Generator -->
        <line x1="150" y1="70" x2="150" y2="100" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrowhead)"/>

        <!-- Generator -->
        <rect x="75" y="100" width="150" height="50" rx="8" fill="transparent" stroke="#3b82f6" stroke-width="2"/>
        <text x="150" y="130" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">생성기</text>
        <text x="150" y="145" text-anchor="middle" fill="#9ca3af" font-size="11">(Generator)</text>

        <!-- Arrow to Critic -->
        <line x1="150" y1="150" x2="150" y2="180" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrowhead)"/>

        <!-- Critic Diamond -->
        <polygon points="150,180 225,230 150,280 75,230" fill="transparent" stroke="#f97316" stroke-width="2"/>
        <text x="150" y="225" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">비평가</text>
        <text x="150" y="240" text-anchor="middle" fill="#9ca3af" font-size="11">(Critic)</text>

        <!-- Pass branch to Final Result -->
        <line x1="225" y1="230" x2="260" y2="230" stroke="#9ca3af" stroke-width="2"/>
        <text x="235" y="220" fill="#10b981" font-size="12">통과</text>
        <line x1="260" y1="230" x2="260" y2="350" stroke="#9ca3af" stroke-width="2"/>
        <line x1="260" y1="350" x2="225" y2="350" stroke="#9ca3af" stroke-width="2" marker-end="url(#arrowhead)"/>

        <!-- Final Result -->
        <rect x="75" y="325" width="150" height="50" rx="8" fill="transparent" stroke="#10b981" stroke-width="2"/>
        <text x="150" y="355" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">최종 결과</text>

        <!-- Feedback branch to Refiner -->
        <line x1="75" y1="230" x2="40" y2="230" stroke="#f97316" stroke-width="2"/>
        <text x="60" y="220" fill="#f97316" font-size="12">피드백</text>
        <line x1="40" y1="230" x2="40" y2="410" stroke="#f97316" stroke-width="2"/>
        <line x1="40" y1="410" x2="75" y2="410" stroke="#f97316" stroke-width="2" marker-end="url(#arrowhead-feedback)"/>

        <!-- Refiner -->
        <rect x="75" y="385" width="150" height="50" rx="8" fill="transparent" stroke="#8b5cf6" stroke-width="2"/>
        <text x="150" y="410" text-anchor="middle" fill="#1a1a2a" font-size="14" font-weight="500">개선기</text>
        <text x="150" y="425" text-anchor="middle" fill="#9ca3af" font-size="11">(Refiner)</text>

        <!-- Loop back from Refiner to Critic -->
        <line x1="75" y1="410" x2="20" y2="410" stroke="#8b5cf6" stroke-width="2"/>
        <line x1="20" y1="410" x2="20" y2="230" stroke="#8b5cf6" stroke-width="2"/>
        <line x1="20" y1="230" x2="75" y2="230" stroke="#8b5cf6" stroke-width="2" marker-end="url(#arrowhead)"/>
      </svg>
    `;
  }

  return { chatbot, resultsViewer };
}
