/* ==========================================================================
   Calcolatrice — expression based, operator precedence, Italian formatting
   ========================================================================== */
(function () {
  'use strict';

  const OPS = { '+': 1, '−': 1, '×': 2, '÷': 2 };

  function evaluate(tokens) {
    // shunting-yard over numbers and binary operators
    const out = [], st = [];
    tokens.forEach((t) => {
      if (typeof t === 'number') out.push(t);
      else {
        while (st.length && OPS[st[st.length - 1]] >= OPS[t]) out.push(st.pop());
        st.push(t);
      }
    });
    while (st.length) out.push(st.pop());
    const s = [];
    for (const t of out) {
      if (typeof t === 'number') { s.push(t); continue; }
      const b = s.pop(), a = s.pop();
      if (a === undefined || b === undefined) return NaN;
      if (t === '+') s.push(a + b);
      if (t === '−') s.push(a - b);
      if (t === '×') s.push(a * b);
      if (t === '÷') s.push(b === 0 ? NaN : a / b);
    }
    return s.length === 1 ? s[0] : NaN;
  }

  function fmtNum(n) {
    if (!isFinite(n)) return 'Errore';
    const abs = Math.abs(n);
    if (abs !== 0 && (abs >= 1e15 || abs < 1e-9)) {
      return n.toExponential(6).replace('.', ',').replace(/0+e/, 'e').replace(',e', 'e');
    }
    const r = parseFloat(n.toPrecision(12));
    return new Intl.NumberFormat('it-IT', { maximumFractionDigits: 10 }).format(r);
  }

  /** formats the number currently being typed, keeping a trailing comma / zeros */
  function fmtEntry(str) {
    const neg = str.startsWith('-');
    const raw = neg ? str.slice(1) : str;
    const [int, frac] = raw.split('.');
    const intFmt = new Intl.NumberFormat('it-IT').format(Number(int || '0'));
    return (neg ? '-' : '') + intFmt + (frac !== undefined ? ',' + frac : '');
  }

  OS.registerApp({
    id: 'calculator',
    name: 'Calcolatrice',
    dark: true,
    background: '#000',
    statusBar: 'light',
    keywords: 'calcolatrice calcoli conti',
    mount(root) {
      root.innerHTML = `<div class="calc">
        <div class="calc-display">
          <div class="calc-expr"></div>
          <div class="calc-value">0</div>
        </div>
        <div class="calc-keys">
          ${[
            ['clear', 'AC', 'fn'], ['sign', '+/−', 'fn'], ['pct', '%', 'fn'], ['op', '÷', 'op'],
            ['num', '7'], ['num', '8'], ['num', '9'], ['op', '×', 'op'],
            ['num', '4'], ['num', '5'], ['num', '6'], ['op', '−', 'op'],
            ['num', '1'], ['num', '2'], ['num', '3'], ['op', '+', 'op'],
            ['mode', '', 'mode'], ['num', '0'], ['dot', ','], ['eq', '=', 'op'],
          ].map(([k, label, cls]) => `<button class="ck ${cls || ''}" data-k="${k}" data-v="${label}">${k === 'mode' ? OS.sym('calculator', { size: 30, stroke: 1.8 }) : label}</button>`).join('')}
        </div>
      </div>`;

      const exprEl = root.querySelector('.calc-expr');
      const valEl = root.querySelector('.calc-value');
      const clearBtn = root.querySelector('[data-k="clear"]');

      let tokens = [];     // committed numbers and operators
      let entry = '0';     // number being typed
      let typing = false;  // true once a digit was typed for the current entry
      let justEvaluated = false;
      let lastExpr = '';

      function render() {
        const exprStr = tokens.map((t) => (typeof t === 'number' ? fmtNum(t) : ` ${t} `)).join('');
        exprEl.textContent = justEvaluated ? lastExpr : exprStr + (typing && tokens.length ? fmtEntry(entry) : '');
        valEl.textContent = entry === 'Errore' ? 'Errore' : fmtEntry(entry);
        const len = valEl.textContent.length;
        valEl.style.fontSize = len > 9 ? Math.max(40, 96 - (len - 9) * 7) + 'px' : '';
        clearBtn.innerHTML = typing || tokens.length ? OS.sym('delete', { size: 30, stroke: 1.8 }) : 'AC';
        clearBtn.dataset.mode = typing || tokens.length ? 'back' : 'ac';
        root.querySelectorAll('.ck.op').forEach((b) => b.classList.toggle('active', !typing && tokens.length && tokens[tokens.length - 1] === b.dataset.v));
      }

      function setEntryFromNumber(n) {
        if (!isFinite(n)) { entry = 'Errore'; return; }
        const r = parseFloat(n.toPrecision(12));
        entry = String(r);
        if (/e/.test(entry)) entry = r.toFixed(10).replace(/\.?0+$/, '');
      }

      function press(k, v) {
        OS.sound('click');
        if (entry === 'Errore' && k !== 'clear') { entry = '0'; tokens = []; typing = false; }
        switch (k) {
          case 'num':
            if (justEvaluated) { tokens = []; justEvaluated = false; entry = '0'; typing = false; }
            if (!typing) { entry = v; typing = true; }
            else if (entry.replace(/[-.]/g, '').length < 9) entry = entry === '0' ? v : entry === '-0' ? '-' + v : entry + v;
            break;
          case 'dot':
            if (justEvaluated) { tokens = []; justEvaluated = false; }
            if (!typing) { entry = '0.'; typing = true; }
            else if (!entry.includes('.')) entry += '.';
            break;
          case 'op':
            justEvaluated = false;
            if (typing || !tokens.length) { tokens.push(parseFloat(entry)); typing = false; }
            if (typeof tokens[tokens.length - 1] === 'string') tokens[tokens.length - 1] = v;
            else tokens.push(v);
            break;
          case 'eq': {
            if (!tokens.length) break;
            if (typing || typeof tokens[tokens.length - 1] === 'string') tokens.push(parseFloat(entry));
            const expr = tokens.map((t) => (typeof t === 'number' ? fmtNum(t) : ` ${t} `)).join('');
            const res = evaluate(tokens);
            lastExpr = expr;
            setEntryFromNumber(res);
            tokens = [];
            typing = false;
            justEvaluated = true;
            OS.store.set('calc:last', res);
            break;
          }
          case 'clear':
            if (clearBtn.dataset.mode === 'back' && typing) {
              entry = entry.length > 1 && !(entry.length === 2 && entry.startsWith('-')) ? entry.slice(0, -1) : '0';
              if (entry === '0' || entry === '-') { entry = '0'; typing = !!tokens.length; if (!tokens.length) typing = false; }
            } else if (clearBtn.dataset.mode === 'back' && tokens.length) {
              tokens.pop();
              if (typeof tokens[tokens.length - 1] === 'number') { entry = String(tokens.pop()); typing = true; }
            } else {
              tokens = []; entry = '0'; typing = false; justEvaluated = false; lastExpr = '';
            }
            break;
          case 'sign':
            if (!typing && tokens.length && typeof tokens[tokens.length - 1] === 'string') entry = '0';
            entry = entry.startsWith('-') ? entry.slice(1) : '-' + entry;
            typing = true;
            justEvaluated = false;
            break;
          case 'pct': {
            const n = parseFloat(entry) / 100;
            setEntryFromNumber(n);
            typing = true;
            justEvaluated = false;
            break;
          }
          case 'mode':
            OS.Island.flash({ left: OS.sym('calculator', { size: 20 }), right: '<span>Calcolatrice di base</span>', width: 260 });
            return;
          default:
        }
        render();
      }

      root.querySelector('.calc-keys').addEventListener('click', (e) => {
        const b = e.target.closest('.ck');
        if (!b) return;
        press(b.dataset.k, b.dataset.v);
      });

      // copy result by tapping the display
      valEl.addEventListener('click', () => {
        if (navigator.clipboard) navigator.clipboard.writeText(valEl.textContent).catch(() => {});
        OS.Island.flash({ left: OS.sym('square-on-square', { size: 18 }), right: '<span>Copiato</span>', width: 200, duration: 1100 });
      });

      const onKey = (e) => {
        const visible = root.isConnected && OS.Apps.current && OS.Apps.current.id === 'calculator' && OS.Apps.mode === 'app';
        if (!visible) return;
        const map = { '+': ['op', '+'], '-': ['op', '−'], '*': ['op', '×'], x: ['op', '×'], '/': ['op', '÷'], Enter: ['eq', '='], '=': ['eq', '='], ',': ['dot', ','], '.': ['dot', ','], Backspace: ['clear', ''], '%': ['pct', '%'] };
        if (/^\d$/.test(e.key)) { press('num', e.key); e.preventDefault(); return; }
        const m = map[e.key];
        if (m) { if (e.key === 'Backspace' && !typing && !tokens.length) return; press(m[0], m[1]); e.preventDefault(); }
      };
      window.addEventListener('keydown', onKey);
      render();
      return { onDestroy() { window.removeEventListener('keydown', onKey); } };
    },
  });
})();
