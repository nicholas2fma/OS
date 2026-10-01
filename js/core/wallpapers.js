/* ==========================================================================
   Wallpapers — procedural SVG artwork (no external images)
   ========================================================================== */
(function () {
  'use strict';

  const W = 402, H = 874;

  function wrap(defs, body) {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice"><defs>${defs}</defs>${body}</svg>`;
  }

  function stars(seed, n, maxY, color) {
    const r = OS.rng(seed);
    let s = '';
    for (let i = 0; i < n; i++) {
      const x = r() * W, y = r() * maxY, rad = r() * 1.1 + .25, o = r() * .7 + .2;
      s += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${rad.toFixed(2)}" fill="${color || '#fff'}" opacity="${o.toFixed(2)}"/>`;
    }
    return s;
  }

  const LIST = [
    {
      id: 'liquido', name: 'Liquido', hue: 220,
      svg: () => wrap(`
        <linearGradient id="bg" x1="0" y1="0" x2=".35" y2="1"><stop offset="0" stop-color="#06164a"/><stop offset=".42" stop-color="#1642c4"/><stop offset=".72" stop-color="#2b6df2"/><stop offset="1" stop-color="#081a5c"/></linearGradient>
        <linearGradient id="b1" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d4ecff" stop-opacity=".95"/><stop offset=".45" stop-color="#6cb4ff" stop-opacity=".6"/><stop offset="1" stop-color="#2a5cff" stop-opacity="0"/></linearGradient>
        <linearGradient id="b2" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a493ff" stop-opacity=".9"/><stop offset="1" stop-color="#3b2fd1" stop-opacity="0"/></linearGradient>
        <linearGradient id="b3" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#5ee0ff" stop-opacity=".7"/><stop offset="1" stop-color="#1e5bff" stop-opacity="0"/></linearGradient>
        <filter id="f1" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="42"/></filter>
        <filter id="f2" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>
        <g filter="url(#f1)"><circle cx="40" cy="120" r="150" fill="#2a8bff" opacity=".85"/><circle cx="390" cy="470" r="170" fill="#5b3cff" opacity=".75"/><circle cx="70" cy="820" r="170" fill="#00b4ff" opacity=".5"/></g>
        <g filter="url(#f2)">
          <path d="M-60 330C80 220 230 500 470 300v100C250 600 90 340-60 450z" fill="url(#b1)"/>
          <path d="M-60 560c180-90 320 140 530 0v90C260 800 110 570-60 670z" fill="url(#b2)" opacity=".9"/>
          <path d="M-60 760c140-70 300 80 530-30v80C280 900 100 760-60 850z" fill="url(#b3)"/>
        </g>
        <path d="M-60 330C80 220 230 500 470 300" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="1.4"/>
        <path d="M-60 560c180-90 320 140 530 0" fill="none" stroke="#fff" stroke-opacity=".3" stroke-width="1.2"/>`),
    },
    {
      id: 'tramonto', name: 'Tramonto', hue: 20,
      svg: () => wrap(`
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#26135e"/><stop offset=".35" stop-color="#9a2f8e"/><stop offset=".62" stop-color="#ff5e62"/><stop offset=".8" stop-color="#ffa45c"/><stop offset="1" stop-color="#ffcf7a"/></linearGradient>
        <radialGradient id="sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#fff4c4"/><stop offset=".55" stop-color="#ffd07a"/><stop offset="1" stop-color="#ffb35c" stop-opacity="0"/></radialGradient>
        <filter id="f" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="30"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>
        <circle cx="200" cy="560" r="150" fill="#ffcf7a" opacity=".55" filter="url(#f)"/>
        <circle cx="200" cy="560" r="78" fill="url(#sun)"/>
        <path d="M0 640c60-30 120-50 190-30s140 10 212-20v284H0z" fill="#b2427c" opacity=".85"/>
        <path d="M0 700c80-20 150 10 230-10s120-30 172-20v204H0z" fill="#7a2a6e"/>
        <path d="M0 770c90-30 170 0 250 10s110-20 152-30v124H0z" fill="#4a1a52"/>
        <path d="M0 830c120-20 240 10 402-10v54H0z" fill="#2a0f36"/>`),
    },
    {
      id: 'aurora', name: 'Aurora', hue: 160,
      svg: () => wrap(`
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#010812"/><stop offset=".6" stop-color="#05213a"/><stop offset="1" stop-color="#03111f"/></linearGradient>
        <linearGradient id="a1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2dffa0" stop-opacity="0"/><stop offset=".6" stop-color="#2dffa0" stop-opacity=".85"/><stop offset="1" stop-color="#19c3ff" stop-opacity="0"/></linearGradient>
        <linearGradient id="a2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9b6bff" stop-opacity="0"/><stop offset=".5" stop-color="#9b6bff" stop-opacity=".7"/><stop offset="1" stop-color="#2dffa0" stop-opacity="0"/></linearGradient>
        <filter id="f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="18"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>${stars('aurora', 140, 600)}
        <g filter="url(#f)">
          <path d="M-40 420C60 200 160 380 230 160s150 120 220-40v360C330 560 260 420 200 560S40 500-40 640z" fill="url(#a1)"/>
          <path d="M-40 300C80 120 180 260 260 80s160 60 200 10v260C360 420 300 300 220 420S60 380-40 480z" fill="url(#a2)" opacity=".8"/>
        </g>
        <path d="M0 760l60-40 50 30 70-70 60 50 50-30 112 70v124H0z" fill="#020a12"/>`),
    },
    {
      id: 'sabbia', name: 'Sabbia', hue: 30, light: true,
      svg: () => wrap(`
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f9efe3"/><stop offset=".55" stop-color="#f2d6b8"/><stop offset="1" stop-color="#e2ad86"/></linearGradient>
        <filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>
        <filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="40"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>
        <circle cx="300" cy="230" r="120" fill="#fff6e6" opacity=".9" filter="url(#g)"/>
        <g filter="url(#f)">
          <path d="M-20 520c120-70 260-20 440-90v460H-20z" fill="#f6dcc0"/>
          <path d="M-20 610c150-80 280 20 440-50v330H-20z" fill="#eec29b"/>
          <path d="M-20 700c120-50 250 40 440-30v220H-20z" fill="#e3a77d"/>
          <path d="M-20 800c160-40 260 20 440-20v120H-20z" fill="#cf8d66"/>
        </g>`),
    },
    {
      id: 'notte', name: 'Notte', hue: 250,
      svg: () => wrap(`
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#04050d"/><stop offset=".55" stop-color="#15123a"/><stop offset="1" stop-color="#2d2160"/></linearGradient>
        <radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#cfd8ff" stop-opacity=".5"/><stop offset="1" stop-color="#cfd8ff" stop-opacity="0"/></radialGradient>
        <mask id="m"><rect width="${W}" height="${H}" fill="#fff"/><circle cx="292" cy="198" r="40" fill="#000"/></mask>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>${stars('notte', 220, 700)}
        <circle cx="280" cy="210" r="120" fill="url(#glow)"/>
        <circle cx="280" cy="210" r="42" fill="#f4f1e6" mask="url(#m)"/>
        <path d="M0 690l70-80 60 60 80-110 70 90 50-50 72 70v204H0z" fill="#0b0920"/>
        <path d="M0 760l90-60 80 50 90-70 142 90v104H0z" fill="#06050f"/>`),
    },
    {
      id: 'prisma', name: 'Prisma', hue: 300,
      svg: () => {
        const cols = ['#ff3b30', '#ff9500', '#ffcc00', '#34c759', '#0a84ff', '#5e5ce6', '#bf5af2'];
        const bands = cols.map((c, i) => {
          const o = i * 46;
          return `<path d="M-80 ${200 + o}C60 ${120 + o} 200 ${420 + o} 480 ${260 + o}v40C220 ${470 + o} 60 ${170 + o}-80 ${250 + o}z" fill="${c}"/>`;
        }).join('');
        return wrap(`
          <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0b12"/><stop offset="1" stop-color="#161624"/></linearGradient>
          <linearGradient id="hl" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/></linearGradient>
          <filter id="f" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="3"/></filter>
          <filter id="g" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="50"/></filter>`,
          `<rect width="${W}" height="${H}" fill="url(#bg)"/>
          <g filter="url(#g)" opacity=".6">${bands}</g>
          <g filter="url(#f)" transform="translate(0 40)">${bands}</g>
          <rect width="${W}" height="${H}" fill="url(#hl)" opacity=".25"/>`);
      },
    },
    {
      id: 'grafite', name: 'Grafite', hue: 220,
      svg: () => wrap(`
        <radialGradient id="bg" cx=".3" cy=".2" r="1.1"><stop offset="0" stop-color="#4a4d57"/><stop offset=".5" stop-color="#22242b"/><stop offset="1" stop-color="#0d0e12"/></radialGradient>
        <filter id="f" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="30"/></filter>`,
        `<rect width="${W}" height="${H}" fill="url(#bg)"/>
        <g filter="url(#f)" opacity=".55"><circle cx="330" cy="700" r="160" fill="#3a5a8c"/><circle cx="60" cy="300" r="110" fill="#6b5c8c"/></g>`),
    },
  ];

  const cache = Object.create(null);

  function url(id) {
    if (!cache[id]) {
      const w = LIST.find((x) => x.id === id) || LIST[0];
      // single-quoted and fully escaped so the value can sit inside style="" attributes
      const data = encodeURIComponent(w.svg()).replace(/'/g, '%27').replace(/\(/g, '%28').replace(/\)/g, '%29');
      cache[id] = `url('data:image/svg+xml;charset=utf-8,${data}')`;
    }
    return cache[id];
  }

  function get(id) { return LIST.find((x) => x.id === id) || LIST[0]; }

  function apply() {
    const id = OS.settings.wallpaper;
    const css = url(id);
    const wp = document.getElementById('wallpaper');
    if (wp) wp.style.backgroundImage = css;
    document.documentElement.style.setProperty('--wallpaper', css);
    document.getElementById('screen').style.setProperty('--tint-h', OS.settings.iconStyle === 'tinted' ? OS.settings.tintHue : get(id).hue);
    OS.emit('wallpaper', id);
  }

  OS.Wallpapers = { list: LIST, url, get, apply };
})();
