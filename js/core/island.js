/* ==========================================================================
   Dynamic Island: live activities (compact / expanded), split bubble,
   transient flashes (silent mode, focus…)
   ========================================================================== */
(function () {
  'use strict';

  const BASE_W = 126, BASE_H = 37;
  let isl, compactL, compactR, expandedEl, flashL, flashR, bubble;
  const activities = new Map();
  let expanded = false;
  let flashTimer = null;
  let flashing = null;

  function sorted() {
    return Array.from(activities.values()).sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }

  function size(w, h, r) {
    isl.style.width = w + 'px';
    isl.style.height = h + 'px';
    isl.style.marginLeft = (-w / 2) + 'px';
    isl.style.borderRadius = r + 'px';
  }

  function layout() {
    const list = sorted();
    const top = list[0];
    isl.classList.remove('compact', 'expanded', 'flash');
    const maxW = OS.state.width - 22;

    if (flashing) {
      isl.classList.add('flash');
      size(Math.min(flashing.width || 250, maxW), BASE_H, 22);
    } else if (expanded && top && top.expanded) {
      isl.classList.add('expanded');
      expandedEl.innerHTML = '';
      top.expanded(expandedEl);
      size(maxW, top.expandedHeight || 150, 46);
    } else if (top) {
      expanded = false;
      isl.classList.add('compact');
      compactL.innerHTML = top.left ? top.left() : '';
      compactR.innerHTML = top.right ? top.right() : '';
      size(top.width || 200, BASE_H, 22);
    } else {
      expanded = false;
      size(BASE_W, BASE_H, 22);
    }

    const second = !flashing && !expanded && list[1];
    document.getElementById('statusbar').classList.toggle('split', !!second);
    if (second) {
      bubble.innerHTML = second.bubble ? second.bubble() : (second.left ? second.left() : '');
      bubble.style.marginLeft = ((top.width || 200) / 2 + 6) + 'px';
      bubble.classList.add('show');
      bubble.onclick = (e) => { e.stopPropagation(); if (second.onTap) second.onTap(); };
    } else {
      bubble.classList.remove('show');
    }
  }

  function set(id, act) {
    act.id = id;
    activities.set(id, act);
    layout();
  }

  function update(id) {
    const act = activities.get(id);
    if (!act) return;
    const top = sorted()[0];
    if (flashing) return;
    if (top === act) {
      if (expanded && act.expanded) {
        if (act.refreshExpanded) act.refreshExpanded(expandedEl);
        else { expandedEl.innerHTML = ''; act.expanded(expandedEl); }
      } else {
        compactL.innerHTML = act.left ? act.left() : '';
        compactR.innerHTML = act.right ? act.right() : '';
      }
    } else if (sorted()[1] === act && !expanded) {
      bubble.innerHTML = act.bubble ? act.bubble() : (act.left ? act.left() : '');
    }
  }

  function clear(id) {
    if (!activities.has(id)) return;
    activities.delete(id);
    if (!activities.size) expanded = false;
    layout();
  }

  function collapse() {
    if (!expanded) return;
    expanded = false;
    layout();
  }

  function flash(o) {
    clearTimeout(flashTimer);
    flashing = o;
    flashL.innerHTML = o.left || '';
    flashR.innerHTML = o.right || '';
    expanded = false;
    layout();
    flashTimer = setTimeout(() => { flashing = null; layout(); }, o.duration || 1800);
  }

  function init() {
    isl = document.getElementById('island');
    isl.innerHTML = `
      <div class="isl-compact"><div class="isl-l"></div><div class="isl-r"></div></div>
      <div class="isl-expanded"></div>
      <div class="isl-flash"><div class="isl-l"></div><div class="isl-r"></div></div>`;
    compactL = isl.querySelector('.isl-compact .isl-l');
    compactR = isl.querySelector('.isl-compact .isl-r');
    expandedEl = isl.querySelector('.isl-expanded');
    flashL = isl.querySelector('.isl-flash .isl-l');
    flashR = isl.querySelector('.isl-flash .isl-r');
    bubble = OS.el('<div id="island-bubble"></div>');
    isl.parentElement.appendChild(bubble);

    isl.addEventListener('click', (e) => {
      const top = sorted()[0];
      if (!top || flashing) return;
      if (expanded) {
        if (e.target.closest('button')) return;
        expanded = false;
        layout();
        if (top.onTap) top.onTap();
        return;
      }
      if (top.expanded) { expanded = true; OS.haptic(10); layout(); }
      else if (top.onTap) top.onTap();
    });

    let pressT = null;
    isl.addEventListener('pointerdown', () => {
      pressT = setTimeout(() => {
        const top = sorted()[0];
        if (top && top.expanded && !expanded) { expanded = true; OS.haptic(14); layout(); }
      }, 450);
    });
    window.addEventListener('pointerup', () => clearTimeout(pressT));

    // tap anywhere else collapses the expanded island
    OS.screenEl.addEventListener('pointerdown', (e) => {
      if (expanded && !e.target.closest('#island')) collapse();
    }, true);

    layout();
  }

  OS.Island = { init, set, update, clear, flash, collapse, get expanded() { return expanded; }, has: (id) => activities.has(id) };
})();
