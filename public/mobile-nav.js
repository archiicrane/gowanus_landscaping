(function () {
  function applyDesktopFlipMode() {
    const body = document.body;
    const main = document.querySelector('main');
    if (!body || !main) return;

    body.classList.remove('desktop-flip-mode');
    main.classList.remove('desktop-flip-main');
    main.querySelectorAll(':scope > section.desktop-flip-slide').forEach((section) => {
      section.classList.remove('desktop-flip-slide');
    });

    const isMapPage = !!body.dataset.mapPage;
    const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;
    if (isMapPage || isMobileViewport) return;

    const sections = Array.from(main.querySelectorAll(':scope > section'));
    if (sections.length < 2) return;

    body.classList.add('desktop-flip-mode');
    main.classList.add('desktop-flip-main');
    sections.forEach((section) => {
      section.classList.add('desktop-flip-slide');
    });
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

    applyDesktopFlipMode();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
