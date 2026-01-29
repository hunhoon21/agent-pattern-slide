/**
 * Slide Navigation Controller
 * Vanilla JavaScript - no modules, runs in browser via script tag
 */

// Global state
let currentSlide = 0;
const TOTAL_SLIDES = 7;

// Chatbot initialization tracking
const initialized = {};

/**
 * Navigate to a specific slide index
 * @param {number} index - Target slide index (0-6)
 */
function navigateTo(index) {
  // Clamp index between 0 and 6
  index = Math.max(0, Math.min(TOTAL_SLIDES - 1, index));

  // Update currentSlide
  currentSlide = index;

  // Remove active class from all slides
  document.querySelectorAll('.slide').forEach(slide => {
    slide.classList.remove('active');
  });

  // Add active class to target slide
  const targetSlide = document.getElementById(`slide-${index + 1}`);
  if (targetSlide) {
    targetSlide.classList.add('active');
  }

  // Update navigation dots
  document.querySelectorAll('.nav-dot').forEach((dot, i) => {
    if (i === index) {
      dot.classList.add('active');
    } else {
      dot.classList.remove('active');
    }
  });

  // Update slide counter
  const counter = document.getElementById('slide-counter');
  if (counter) {
    counter.textContent = `${index + 1} / ${TOTAL_SLIDES}`;
  }

  // Update URL hash
  window.location.hash = `slide-${index + 1}`;

  // Dispatch custom event
  const event = new CustomEvent('slide-changed', {
    detail: { slideIndex: index }
  });
  document.dispatchEvent(event);
}

/**
 * Navigate to previous slide
 */
function prevSlide() {
  navigateTo(currentSlide - 1);
}

/**
 * Navigate to next slide
 */
function nextSlide() {
  navigateTo(currentSlide + 1);
}

/**
 * Check if an input element has focus
 * @returns {boolean}
 */
function isInputFocused() {
  const activeElement = document.activeElement;
  return activeElement && (
    activeElement.tagName === 'INPUT' ||
    activeElement.tagName === 'TEXTAREA' ||
    activeElement.isContentEditable
  );
}

/**
 * Toggle shortcuts overlay visibility
 */
function toggleShortcuts() {
  const overlay = document.getElementById('shortcuts-overlay');
  if (overlay) {
    const isVisible = overlay.style.display === 'block';
    overlay.style.display = isVisible ? 'none' : 'block';
  }
}

/**
 * Check API key status and show error modal if missing
 */
async function checkApiKey() {
  try {
    const response = await fetch('/api/health');
    const data = await response.json();

    if (!data.hasApiKey) {
      const errorModal = document.getElementById('error-modal');
      if (errorModal) {
        errorModal.style.display = 'block';
      }
    }
  } catch (error) {
    console.error('Failed to check API key status:', error);
  }
}

/**
 * Generate navigation dots
 */
function generateNavDots() {
  const navDotsContainer = document.getElementById('nav-dots');
  if (!navDotsContainer) return;

  // Clear existing dots
  navDotsContainer.innerHTML = '';

  // Create dots
  for (let i = 0; i < TOTAL_SLIDES; i++) {
    const dot = document.createElement('div');
    dot.className = 'nav-dot';
    if (i === currentSlide) {
      dot.classList.add('active');
    }
    dot.dataset.slide = i;

    // Add click handler
    dot.addEventListener('click', () => {
      navigateTo(i);
    });

    navDotsContainer.appendChild(dot);
  }
}

/**
 * Parse URL hash and return slide index
 * @returns {number} Slide index (0-6)
 */
function parseUrlHash() {
  const hash = window.location.hash;
  if (!hash) return 0;

  const match = hash.match(/^#slide-(\d+)$/);
  if (match) {
    const slideNumber = parseInt(match[1], 10);
    // Convert 1-indexed to 0-indexed and clamp
    return Math.max(0, Math.min(TOTAL_SLIDES - 1, slideNumber - 1));
  }

  return 0;
}

/**
 * Setup keyboard event handlers
 */
function setupKeyboardHandlers() {
  document.addEventListener('keydown', (e) => {
    // Ignore keyboard shortcuts if input is focused
    const shouldIgnore = isInputFocused();

    switch (e.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        if (!shouldIgnore) {
          e.preventDefault();
          nextSlide();
        }
        break;

      case ' ': // Space
        if (!shouldIgnore) {
          e.preventDefault();
          nextSlide();
        }
        break;

      case 'ArrowLeft':
      case 'ArrowUp':
        if (!shouldIgnore) {
          e.preventDefault();
          prevSlide();
        }
        break;

      case 'Home':
        if (!shouldIgnore) {
          e.preventDefault();
          navigateTo(0);
        }
        break;

      case 'End':
        if (!shouldIgnore) {
          e.preventDefault();
          navigateTo(TOTAL_SLIDES - 1);
        }
        break;

      case '?':
        e.preventDefault();
        toggleShortcuts();
        break;

      case '1':
      case '2':
      case '3':
      case '4':
      case '5':
      case '6':
      case '7':
        if (!shouldIgnore) {
          e.preventDefault();
          const slideIndex = parseInt(e.key, 10) - 1;
          navigateTo(slideIndex);
        }
        break;
    }
  });
}

/**
 * Setup click event handlers
 */
function setupClickHandlers() {
  // Previous button
  const prevBtn = document.getElementById('nav-prev');
  if (prevBtn) {
    prevBtn.addEventListener('click', prevSlide);
  }

  // Next button
  const nextBtn = document.getElementById('nav-next');
  if (nextBtn) {
    nextBtn.addEventListener('click', nextSlide);
  }

  // Error modal close
  const modalClose = document.getElementById('modal-close');
  if (modalClose) {
    modalClose.addEventListener('click', () => {
      const errorModal = document.getElementById('error-modal');
      if (errorModal) {
        errorModal.style.display = 'none';
      }
    });
  }

  // Shortcuts overlay close
  const shortcutsOverlay = document.getElementById('shortcuts-overlay');
  if (shortcutsOverlay) {
    const closeBtn = shortcutsOverlay.querySelector('.modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        shortcutsOverlay.style.display = 'none';
      });
    }
  }
}

/**
 * Setup touch/swipe handlers
 */
function setupTouchHandlers() {
  let touchStartX = 0;
  let touchStartY = 0;

  document.addEventListener('touchstart', (e) => {
    touchStartX = e.touches[0].clientX;
    touchStartY = e.touches[0].clientY;
  }, { passive: true });

  document.addEventListener('touchend', (e) => {
    if (!e.changedTouches || !e.changedTouches[0]) return;

    const touchEndX = e.changedTouches[0].clientX;
    const touchEndY = e.changedTouches[0].clientY;
    const deltaX = touchEndX - touchStartX;
    const deltaY = touchEndY - touchStartY;

    // Only process horizontal swipes (ignore if vertical movement is greater)
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    // Swipe left (next slide)
    if (deltaX < -50) {
      nextSlide();
    }
    // Swipe right (previous slide)
    else if (deltaX > 50) {
      prevSlide();
    }
  }, { passive: true });
}

/**
 * Setup chatbot lazy initialization
 */
function setupChatbotInitialization() {
  document.addEventListener('slide-changed', (e) => {
    const idx = e.detail.slideIndex;

    // Initialize reflection on explanation slide (index 1) or demo slide (index 2)
    if ((idx === 1 || idx === 2) && !initialized.reflection) {
      initialized.reflection = true;
      if (typeof initReflectionDemo === 'function') {
        initReflectionDemo();
      }
    }

    // Initialize orchestrator on explanation slide (index 4) or demo slide (index 5)
    if ((idx === 4 || idx === 5) && !initialized.orchestrator) {
      initialized.orchestrator = true;
      if (typeof initOrchestratorDemo === 'function') {
        initOrchestratorDemo();
      }
    }
  });
}

/**
 * Setup sample prompt click handlers
 */
function setupSamplePrompts() {
  document.querySelectorAll('.sample-prompt').forEach(el => {
    el.addEventListener('click', () => {
      const prompt = el.dataset.prompt;
      if (!prompt) return;

      // Find the nearest input field in the demo slide
      const container = el.closest('.demo-slide, .demo-layout');
      const input = container ? container.querySelector('input[type="text"]') : null;

      if (input) {
        input.value = prompt;
        input.focus();
      }
    });
  });
}

/**
 * Initialize the application
 */
function init() {
  // Generate navigation dots
  generateNavDots();

  // Parse URL hash and navigate to initial slide
  const initialSlide = parseUrlHash();
  navigateTo(initialSlide);

  // Check API key status
  checkApiKey();

  // Setup event handlers
  setupKeyboardHandlers();
  setupClickHandlers();
  setupTouchHandlers();
  setupChatbotInitialization();
  setupSamplePrompts();
}

// Initialize on DOMContentLoaded
document.addEventListener('DOMContentLoaded', init);
