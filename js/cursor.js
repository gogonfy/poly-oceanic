/* POLY — lightweight custom cursor. */
(function () {
  'use strict';
  var fine = window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (!fine) return;

  var ring = document.createElement('div');
  var dot = document.createElement('div');
  var ringVisual = document.createElement('span');
  var dotVisual = document.createElement('span');
  ring.className = 'poly-cursor-ring';
  dot.className = 'poly-cursor-dot';
  ringVisual.className = 'poly-cursor-ring-visual';
  dotVisual.className = 'poly-cursor-dot-visual';
  ring.appendChild(ringVisual);
  dot.appendChild(dotVisual);
  ring.setAttribute('aria-hidden', 'true');
  dot.setAttribute('aria-hidden', 'true');
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  var visible = false, hovering = false;
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

  function move(event) {
    if (event.pointerType && event.pointerType !== 'mouse') return;
    var x = event.clientX;
    var y = event.clientY;
    var moveTo = 'translate3d(' + x + 'px,' + y + 'px,0)';
    dot.style.transform = moveTo;
    ring.style.transform = moveTo;
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
  Array.prototype.forEach.call(document.querySelectorAll('iframe'), function (frame) {
    frame.addEventListener('mouseenter', hide);
  });
})();
