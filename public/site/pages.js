(function () {
  document.documentElement.classList.add('js');
  var bar = document.querySelector('.progress'), nav = document.querySelector('.topnav');
  // Sections and cards fade up as they scroll into view.
  var targets = document.querySelectorAll('main section, main > div > section, [data-rv]');
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px' });
  targets.forEach(function (el) { el.classList.add('rv'); io.observe(el); });
  // Cursor spotlight on bordered cards.
  document.querySelectorAll('[style*="border-radius: 16px"],[style*="border-radius: 14px"],[style*="border-radius: 12px"]').forEach(function (el) {
    if (el.tagName === 'A' || el.closest('header')) return;
    el.classList.add('spot');
    el.addEventListener('pointermove', function (ev) { var r = el.getBoundingClientRect(); el.style.setProperty('--mx', (ev.clientX - r.left) + 'px'); el.style.setProperty('--my', (ev.clientY - r.top) + 'px'); });
  });
  // Docs sidebar follows the section you're reading.
  var links = document.querySelectorAll('aside[aria-label="Docs sections"] a[href^="#"]'), secs = [];
  links.forEach(function (a) { var s = document.getElementById(a.getAttribute('href').slice(1)); if (s) secs.push([s, a]); });
  function frame() {
    var y = scrollY, vh = innerHeight;
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / Math.max(1, document.documentElement.scrollHeight - vh)) + ')';
    if (nav) nav.classList.toggle('scrolled', y > 8);
    if (secs.length) {
      var cur = secs[0][1];
      secs.forEach(function (p) { if (p[0].getBoundingClientRect().top < vh * 0.35) cur = p[1]; });
      links.forEach(function (a) {
        var on = a === cur, was = a.classList.contains('active');
        a.classList.toggle('active', on);
        // keep the active chip visible in the horizontal bar on phones
        if (on && !was && a.parentElement && getComputedStyle(a.parentElement).display === 'contents') {
          var bar2 = a.closest('aside'); bar2.scrollTo({ left: a.offsetLeft - 24, behavior: 'smooth' });
        }
      });
    }
  }
  var t = false;
  addEventListener('scroll', function () { if (t) return; t = true; requestAnimationFrame(function () { t = false; frame(); }); }, { passive: true });
  frame();
})();
