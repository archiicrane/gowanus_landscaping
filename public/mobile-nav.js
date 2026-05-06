(function () {
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
      });

      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') {
          closeMenu(bar, button);
        }
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMobileNav);
  } else {
    initMobileNav();
  }
})();
