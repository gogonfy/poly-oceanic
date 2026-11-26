/* POLY — lightweight custom cursor. */
(function () {
  'use strict';
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ring = document.createElement('div');
  var dot = document.createElement('div');
  ring.className = 'poly-cursor-ring';
  dot.className = 'poly-cursor-dot';
  ring.setAttribute('aria-hidden', 'true');
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  var x = -100, y = -100, rx = -100, ry = -100;
  var raf = 0, visible = false, hovering = false;
  var interactiveSelector = 'a,button,[role="button"],input,select,textarea,label,summary,canvas,[data-cursor]';

  function show() {
    if (visible) return;
    visible = true;
    document.documentElement.classList.add('has-poly-cursor');
    ring.classList.add('is-visible');
    dot.classList.add('is-visible');
  }

  function hide() {
    visible = false;
    ring.classList.remove('is-visible');
    dot.classList.remove('is-visible');
  }

  function setHover(next) {
    if (next === hovering) return;
    hovering = next;
    ring.classList.toggle('is-hover', hovering);
    dot.classList.toggle('is-hover', hovering);
  }

  function tick() {
    raf = 0;
    rx += (x - rx) * 0.2;
    ry += (y - ry) * 0.2;
    ring.style.transform = 'translate3d(' + rx.toFixed(2) + 'px,' + ry.toFixed(2) + 'px,0)';
    if (Math.abs(x - rx) > 0.12 || Math.abs(y - ry) > 0.12) {
      raf = window.requestAnimationFrame(tick);
    }
  }

  function move(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    x = event.clientX;
    y = event.clientY;
    dot.style.transform = 'translate3d(' + x + 'px,' + y + 'px,0)';
    if (reduce) {
      rx = x;
      ry = y;
      ring.style.transform = dot.style.transform;
    } else if (!raf) {
      raf = window.requestAnimationFrame(tick);
    }
    show();
    var target = event.target;
    var interactive = target && target.closest ? target.closest(interactiveSelector) : null;
    setHover(!!interactive);
  }

  window.addEventListener('pointermove', move, { passive: true });
  window.addEventListener('pointerdown', function () {
    ring.classList.add('is-down');
    dot.classList.add('is-down');
  }, { passive: true });
  window.addEventListener('pointerup', function () {
    ring.classList.remove('is-down');
    dot.classList.remove('is-down');
  }, { passive: true });
  window.addEventListener('pointercancel', function () {
    ring.classList.remove('is-down');
    dot.classList.remove('is-down');
  }, { passive: true });
  document.addEventListener('mouseleave', hide);
  window.addEventListener('blur', hide);
})();
