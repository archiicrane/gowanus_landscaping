(function () {
  const presentationState = {
    eligible: false,
    enabled: false,
    sections: [],
    main: null,
    boundMain: null,
    currentIndex: 0,
    wheelLocked: false,
    wheelTimer: null,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function getNearestSectionIndex() {
    if (!presentationState.main || !presentationState.sections.length) return 0;
    const scrollTop = presentationState.main.scrollTop;
    let bestIndex = 0;
    let bestDistance = Infinity;
    presentationState.sections.forEach((section, index) => {
      const distance = Math.abs(section.offsetTop - scrollTop);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestIndex = index;
      }
    });
    return bestIndex;
  }

  function updatePresentationControls() {
    const controls = document.getElementById('desktop-book-controls');
    if (!controls) return;

    controls.classList.toggle('is-visible', presentationState.eligible);
    controls.classList.toggle('is-active', presentationState.enabled);

    const toggle = document.getElementById('desktop-book-toggle');
    const prev = document.getElementById('desktop-book-prev');
    const next = document.getElementById('desktop-book-next');
    const count = document.getElementById('desktop-book-count');

    if (toggle) {
      toggle.textContent = presentationState.enabled ? 'Exit Book' : 'Book Mode';
      toggle.setAttribute('aria-pressed', String(presentationState.enabled));
    }

    const maxIndex = Math.max(0, presentationState.sections.length - 1);
    if (prev) prev.disabled = !presentationState.enabled || presentationState.currentIndex <= 0;
    if (next) next.disabled = !presentationState.enabled || presentationState.currentIndex >= maxIndex;
    if (count) count.textContent = `${presentationState.currentIndex + 1}/${presentationState.sections.length || 1}`;
  }

  function goToSection(index, behavior) {
    if (!presentationState.main || !presentationState.sections.length) return;
    const maxIndex = presentationState.sections.length - 1;
    presentationState.currentIndex = clamp(index, 0, maxIndex);
    const target = presentationState.sections[presentationState.currentIndex];
    presentationState.main.scrollTo({
      top: target.offsetTop,
      behavior: behavior || 'smooth',
    });
    updatePresentationControls();
  }

  function setPresentationEnabled(nextEnabled) {
    if (!presentationState.eligible) {
      presentationState.enabled = false;
      return;
    }

    presentationState.enabled = !!nextEnabled;
    const body = document.body;
    if (!body || !presentationState.main) return;

    body.classList.toggle('desktop-flip-mode', presentationState.enabled);
    presentationState.main.classList.toggle('desktop-flip-main', presentationState.enabled);
    presentationState.sections.forEach((section) => {
      section.classList.toggle('desktop-flip-slide', presentationState.enabled);
    });

    if (presentationState.enabled) {
      presentationState.currentIndex = getNearestSectionIndex();
      goToSection(presentationState.currentIndex, 'auto');
    }
    updatePresentationControls();
  }

  function onBookWheel(event) {
    if (!presentationState.enabled) return;
    event.preventDefault();
    if (presentationState.wheelLocked) return;

    presentationState.wheelLocked = true;
    if (presentationState.wheelTimer) {
      window.clearTimeout(presentationState.wheelTimer);
    }

    if (event.deltaY > 0) {
      goToSection(presentationState.currentIndex + 1);
    } else if (event.deltaY < 0) {
      goToSection(presentationState.currentIndex - 1);
    }

    presentationState.wheelTimer = window.setTimeout(function () {
      presentationState.wheelLocked = false;
    }, 420);
  }

  function onBookKeydown(event) {
    if (!presentationState.enabled) return;
    const target = event.target;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;

    if (event.key === 'ArrowDown' || event.key === 'PageDown' || event.key === ' ') {
      event.preventDefault();
      goToSection(presentationState.currentIndex + 1);
      return;
    }

    if (event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      goToSection(presentationState.currentIndex - 1);
      return;
    }

    if (event.key === 'Escape') {
      setPresentationEnabled(false);
    }
  }

  function ensurePresentationControls() {
    if (document.getElementById('desktop-book-controls')) return;

    const controls = document.createElement('div');
    controls.id = 'desktop-book-controls';
    controls.className = 'desktop-book-controls';
    controls.innerHTML = '' +
      '<button id="desktop-book-toggle" class="desktop-book-btn" type="button" aria-pressed="false">Book Mode</button>' +
      '<div class="desktop-book-stepper">' +
      '  <button id="desktop-book-prev" class="desktop-book-btn" type="button" aria-label="Previous section">Prev</button>' +
      '  <span id="desktop-book-count" class="desktop-book-count">1/1</span>' +
      '  <button id="desktop-book-next" class="desktop-book-btn" type="button" aria-label="Next section">Next</button>' +
      '</div>';

    document.body.appendChild(controls);

    const toggle = document.getElementById('desktop-book-toggle');
    const prev = document.getElementById('desktop-book-prev');
    const next = document.getElementById('desktop-book-next');

    if (toggle) {
      toggle.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        setPresentationEnabled(!presentationState.enabled);
      });
    }

    if (prev) {
      prev.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        goToSection(presentationState.currentIndex - 1);
      });
    }

    if (next) {
      next.addEventListener('click', function (event) {
        event.preventDefault();
        event.stopPropagation();
        goToSection(presentationState.currentIndex + 1);
      });
    }
  }

  function applyDesktopFlipMode() {
    const body = document.body;
    const main = document.querySelector('main');
    if (!body || !main) return;

    ensurePresentationControls();

    const isMapPage = !!body.dataset.mapPage;
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

    presentationState.main = main;
    presentationState.sections = Array.from(main.querySelectorAll(':scope > section'));
    presentationState.eligible = !isMapPage && !isMobileViewport && presentationState.sections.length > 1;

    if (presentationState.boundMain && presentationState.boundMain !== main) {
      presentationState.boundMain.removeEventListener('wheel', onBookWheel);
      presentationState.boundMain = null;
    }

    if (presentationState.eligible && presentationState.boundMain !== main) {
      main.addEventListener('wheel', onBookWheel, { passive: false });
      presentationState.boundMain = main;
    }

    if (!presentationState.eligible && presentationState.enabled) {
      setPresentationEnabled(false);
    }

    if (!presentationState.enabled) {
      body.classList.remove('desktop-flip-mode');
      main.classList.remove('desktop-flip-main');
      presentationState.sections.forEach((section) => {
        section.classList.remove('desktop-flip-slide');
      });
    }

    presentationState.currentIndex = getNearestSectionIndex();
    updatePresentationControls();
  }

  function closeMenu(bar, button) {
    bar.classList.remove('nav-open');
    button.setAttribute('aria-expanded', 'false');
  }

  function initMobileNav() {
    const bars = document.querySelectorAll('.top-bar');
    bars.forEach((bar) => {
      const nav = bar.querySelector('.nav-links');
      if (!nav) return;

      let button = bar.querySelector('.mobile-menu-btn');
      if (!button) {
        button = document.createElement('button');
        button.type = 'button';
        button.className = 'mobile-menu-btn';
        button.setAttribute('aria-label', 'Toggle navigation menu');
        button.setAttribute('aria-expanded', 'false');
        button.setAttribute('aria-controls', 'mobile-nav-links');
        button.innerHTML = '<span></span><span></span><span></span>';
        nav.id = 'mobile-nav-links';
        bar.insertBefore(button, nav);
      }

      button.addEventListener('click', function (event) {
        event.stopPropagation();
        const isOpen = bar.classList.toggle('nav-open');
        button.setAttribute('aria-expanded', String(isOpen));
      });

      nav.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', function () {
          closeMenu(bar, button);
        });
      });

      document.addEventListener('click', function (event) {
        if (!bar.contains(event.target)) {
          closeMenu(bar, button);
        }
      });

      window.addEventListener('resize', function () {
        if (window.innerWidth > 760) {
          closeMenu(bar, button);
        }
        applyDesktopFlipMode();
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          closeMenu(bar, button);
        }
      });
    });

    document.addEventListener('keydown', onBookKeydown);

    applyDesktopFlipMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
