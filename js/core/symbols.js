/* ==========================================================================
   Symbol set (24×24, stroke based) — original glyphs in a SF-Symbols spirit
   ========================================================================== */
(function () {
  'use strict';

  const F = 'fill="currentColor" stroke="none"';

  const P = {
    'chevron-left': '<path d="M15 4.5 7.5 12l7.5 7.5"/>',
    'chevron-right': '<path d="m9 4.5 7.5 7.5L9 19.5"/>',
    'chevron-down': '<path d="m5 9 7 7 7-7"/>',
    'chevron-up': '<path d="m5 15 7-7 7 7"/>',
    plus: '<path d="M12 4.5v15M4.5 12h15"/>',
    minus: '<path d="M4.5 12h15"/>',
    xmark: '<path d="m6 6 12 12M18 6 6 18"/>',
    check: '<path d="m4.5 12.5 5 5L19.5 7"/>',
    ellipsis: `<circle cx="5" cy="12" r="1.8" ${F}/><circle cx="12" cy="12" r="1.8" ${F}/><circle cx="19" cy="12" r="1.8" ${F}/>`,
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    compose: '<path d="M11 4H6.5A2.5 2.5 0 0 0 4 6.5v11A2.5 2.5 0 0 0 6.5 20h11a2.5 2.5 0 0 0 2.5-2.5V13"/><path d="M17.6 3.6a2 2 0 0 1 2.8 2.8L12 14.8l-3.6.8.8-3.6z"/>',
    trash: '<path d="M4 6.5h16M9.5 6.5V4h5v2.5M6 6.5l1 13.5h10l1-13.5M10 10.5v6M14 10.5v6"/>',
    heart: '<path d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 6.9a4.9 4.9 0 0 1 9.2 3.7C19.5 15.4 12 20 12 20z"/>',
    'heart-fill': `<path ${F} d="M12 20s-7.5-4.6-9.2-9.4A4.9 4.9 0 0 1 12 6.9a4.9 4.9 0 0 1 9.2 3.7C19.5 15.4 12 20 12 20z"/>`,
    share: '<path d="M12 3.5v11M8 7.5l4-4 4 4"/><path d="M8 10.5H6.5A1.5 1.5 0 0 0 5 12v7a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-7a1.5 1.5 0 0 0-1.5-1.5H16"/>',
    play: `<path ${F} d="M7.5 4.8v14.4c0 .8.9 1.3 1.6.9l11.3-7.2a1.1 1.1 0 0 0 0-1.8L9.1 3.9c-.7-.4-1.6.1-1.6.9z"/>`,
    pause: `<rect ${F} x="6" y="4.5" width="4.2" height="15" rx="1.2"/><rect ${F} x="13.8" y="4.5" width="4.2" height="15" rx="1.2"/>`,
    stop: `<rect ${F} x="6" y="6" width="12" height="12" rx="2"/>`,
    forward: `<path ${F} d="M2.5 6.6v10.8c0 .7.8 1.1 1.4.7L11 13v4.4c0 .7.8 1.1 1.4.7l8.4-5.4a.8.8 0 0 0 0-1.4L12.4 5.9c-.6-.4-1.4 0-1.4.7V11L3.9 5.9c-.6-.4-1.4 0-1.4.7z"/>`,
    backward: `<path ${F} d="M21.5 6.6v10.8c0 .7-.8 1.1-1.4.7L13 13v4.4c0 .7-.8 1.1-1.4.7l-8.4-5.4a.8.8 0 0 1 0-1.4l8.4-5.4c.6-.4 1.4 0 1.4.7V11l7.1-5.1c.6-.4 1.4 0 1.4.7z"/>`,
    shuffle: '<path d="M3 7h3.5c4.5 0 6 10 10.5 10H21M3 17h3.5c1.6 0 2.8-1.4 3.9-3.2M13.6 10.2C14.7 8.4 15.9 7 17.5 7H21M18 4l3 3-3 3M18 14l3 3-3 3"/>',
    repeat: '<path d="M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M17 3l3 3-3 3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4M7 21l-3-3 3-3"/>',
    wifi: `<path d="M2.2 8.8a14.4 14.4 0 0 1 19.6 0M5.4 12.3a9.8 9.8 0 0 1 13.2 0M8.6 15.7a5.2 5.2 0 0 1 6.8 0"/><circle cx="12" cy="19" r="1.4" ${F}/>`,
    bluetooth: '<path d="m7 7.5 10 9-5 4.5V3l5 4.5-10 9"/>',
    airplane: `<path ${F} d="M21.2 15.6v-1.9l-7.7-4.8V3.9a1.5 1.5 0 0 0-3 0v5L2.8 13.7v1.9l7.7-2.4v5.2l-2.2 1.6v1.5L12 20.4l3.7 1.1V20l-2.2-1.6v-5.2z"/>`,
    antenna: `<circle cx="12" cy="9" r="1.7" ${F}/><path d="M12 11v10M8.3 5.3a5.3 5.3 0 0 0 0 7.4M15.7 5.3a5.3 5.3 0 0 1 0 7.4M5.3 2.6a9.2 9.2 0 0 0 0 12.8M18.7 2.6a9.2 9.2 0 0 1 0 12.8"/>`,
    hotspot: '<circle cx="12" cy="12" r="2"/><path d="M8.5 8.5a5 5 0 0 0 0 7M15.5 8.5a5 5 0 0 1 0 7M5.6 5.6a9 9 0 0 0 0 12.8M18.4 5.6a9 9 0 0 1 0 12.8"/>',
    flashlight: '<path d="M8 2.5h8V7l-2 3.2V21a.5.5 0 0 1-.5.5h-3A.5.5 0 0 1 10 21V10.2L8 7z"/><path d="M8 6h8M12 13.5v2.5"/>',
    'flashlight-fill': `<path ${F} d="M8 2.5h8V6H8zM8 7h8l-2 3.2V21a.5.5 0 0 1-.5.5h-3A.5.5 0 0 1 10 21V10.2z"/>`,
    timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M9.5 2.5h5M18.5 6.5 20 5"/>',
    calculator: '<rect x="5" y="2.5" width="14" height="19" rx="3"/><path d="M8.5 7h7M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01M8.5 15h.01M12 15h.01M15.5 15h.01M8.5 18.5h.01M12 18.5h.01M15.5 18.5h.01"/>',
    camera: '<path d="M4.5 7.5h2.8l1.8-2.6h5.8l1.8 2.6h2.8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="12" cy="13.5" r="3.8"/>',
    'camera-fill': `<path ${F} d="M4.5 7.5h2.8l1.8-2.6h5.8l1.8 2.6h2.8A1.5 1.5 0 0 1 21 9v9.5a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5V9a1.5 1.5 0 0 1 1.5-1.5zM12 17.3a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6z" fill-rule="evenodd"/>`,
    moon: `<path ${F} d="M20.3 14.6A8.5 8.5 0 0 1 9.4 3.7a8.5 8.5 0 1 0 10.9 10.9z"/>`,
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/>',
    'sun-fill': `<circle cx="12" cy="12" r="4.5" ${F}/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/>`,
    'circle-half': `<circle cx="12" cy="12" r="8.5"/><path ${F} d="M12 3.5a8.5 8.5 0 0 1 0 17z"/>`,
    speaker: `<path ${F} d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5z"/><path d="M15.5 9a4.2 4.2 0 0 1 0 6M18.2 6.3a8 8 0 0 1 0 11.4"/>`,
    'speaker-slash': `<path ${F} d="M3.5 9.2h3.6L12 5v14l-4.9-4.2H3.5z"/><path d="m15.5 9.5 5 5M20.5 9.5l-5 5"/>`,
    bell: '<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.7 1.8H4.3z"/><path d="M10 20.5a2.2 2.2 0 0 0 4 0"/>',
    'bell-fill': `<path ${F} d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.7 1.8H4.3zM9.8 19.8h4.4a2.2 2.2 0 0 1-4.4 0z"/>`,
    'bell-slash': '<path d="M6 16.5V11a6 6 0 0 1 9.6-4.8M18 11v5.5l1.7 1.8H6.5M10 20.5a2.2 2.2 0 0 0 4 0M3.5 3.5l17 17"/>',
    lock: '<rect x="5" y="10.5" width="14" height="10.5" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
    'lock-fill': `<path ${F} d="M7.5 10.5V7.5a4.5 4.5 0 0 1 9 0v3h.5a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2zm2 0h5v-3a2.5 2.5 0 0 0-5 0z"/>`,
    'lock-open-fill': `<path ${F} d="M7 10.5h10a2 2 0 0 1 2 2V19a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-6.5a2 2 0 0 1 2-2z"/><path d="M8.5 10.5V7a4 4 0 0 1 7.6-1.7"/>`,
    'rotation-lock': '<path d="M20 12a8 8 0 1 1-2.3-5.7"/><path d="M18.5 3v4h-4"/><rect x="9" y="11" width="6" height="5" rx="1"/><path d="M10.2 11V9.8a1.8 1.8 0 0 1 3.6 0V11"/>',
    mirroring: '<rect x="3" y="5" width="13" height="10" rx="2"/><rect x="8" y="9" width="13" height="10" rx="2"/>',
    phone: `<path ${F} d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>`,
    'phone-down': `<path ${F} transform="rotate(135 12 12)" d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1A17 17 0 0 1 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1z"/>`,
    video: '<rect x="2.5" y="6" width="13" height="12" rx="3"/><path d="m15.5 10.2 6-3.4v10.4l-6-3.4"/>',
    'video-fill': `<rect ${F} x="2.5" y="6" width="13" height="12" rx="3"/><path ${F} d="m16.5 10 5-3v10l-5-3z"/>`,
    message: '<path d="M12 4c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.8 20l1-3.7C4 15 3 13.2 3 11.2 3 7.2 7 4 12 4z"/>',
    'message-fill': `<path ${F} d="M12 4c5 0 9 3.2 9 7.2s-4 7.2-9 7.2c-1 0-2-.1-2.9-.4L4.8 20l1-3.7C4 15 3 13.2 3 11.2 3 7.2 7 4 12 4z"/>`,
    person: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
    'person-fill': `<circle cx="12" cy="8" r="4.2" ${F}/><path ${F} d="M3.5 20.5a8.5 8.5 0 0 1 17 0c0 .3-.2.5-.5.5H4a.5.5 0 0 1-.5-.5z"/>`,
    'person-circle': '<circle cx="12" cy="12" r="9.5"/><circle cx="12" cy="10" r="3.2"/><path d="M6.2 18.5a7 7 0 0 1 11.6 0"/>',
    'person-add': '<circle cx="10" cy="8" r="4"/><path d="M2.5 21a7.5 7.5 0 0 1 13.5-4.5M19 14v6M16 17h6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
    'clock-fill': `<path ${F} fill-rule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm.8-14a.8.8 0 0 0-1.6 0v5c0 .3.1.5.4.7l3.2 2a.8.8 0 0 0 .8-1.4l-2.8-1.7z"/>`,
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3C9.5 5.6 8.2 8.6 8.2 12s1.3 6.4 3.8 9"/>',
    alarm: '<circle cx="12" cy="13" r="7.5"/><path d="M12 9v4.2l2.6 1.6M4 5.5 7 3M20 5.5 17 3"/>',
    'alarm-fill': `<path ${F} fill-rule="evenodd" d="M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.8-12a.8.8 0 0 0-1.6 0v4.2c0 .3.1.5.4.7l2.6 1.6a.8.8 0 0 0 .8-1.4l-2.2-1.3z"/><path d="M4 5.5 7 3M20 5.5 17 3"/>`,
    stopwatch: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.8M10 2.5h4M12 2.5V6M18.3 7.2l1.5-1.5"/>',
    'stopwatch-fill': `<path ${F} fill-rule="evenodd" d="M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.8-11.7a.8.8 0 0 0-1.6 0v3.7a.8.8 0 0 0 1.6 0z"/><path d="M10 2.5h4M12 2.5V5.5M18.3 7.2l1.5-1.5"/>`,
    'timer-fill': `<path ${F} fill-rule="evenodd" d="M12 21.5a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.8-12a.8.8 0 0 0-1.6 0v4a.8.8 0 0 0 1.6 0z"/><path d="M9.5 2.5h5"/>`,
    keypad: `<g ${F}><circle cx="6" cy="5" r="1.9"/><circle cx="12" cy="5" r="1.9"/><circle cx="18" cy="5" r="1.9"/><circle cx="6" cy="11" r="1.9"/><circle cx="12" cy="11" r="1.9"/><circle cx="18" cy="11" r="1.9"/><circle cx="6" cy="17" r="1.9"/><circle cx="12" cy="17" r="1.9"/><circle cx="18" cy="17" r="1.9"/><circle cx="12" cy="22" r="1.4"/></g>`,
    star: '<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
    'star-fill': `<path ${F} d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>`,
    'arrow-up': '<path d="M12 19.5v-15M5.5 11 12 4.5l6.5 6.5"/>',
    'arrow-up-circle-fill': `<path ${F} fill-rule="evenodd" d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zm.7-14.7a1 1 0 0 0-1.4 0l-3.5 3.5a1 1 0 1 0 1.4 1.4l1.8-1.8V16a1 1 0 1 0 2 0v-5.6l1.8 1.8a1 1 0 1 0 1.4-1.4z"/>`,
    'arrow-clockwise': '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4h-4"/>',
    location: `<path ${F} d="M20.6 3.4a.7.7 0 0 0-.8-.1L3.5 10.6c-.6.3-.5 1.2.1 1.3l6.8 1.7 1.7 6.8c.1.6 1 .7 1.3.1l7.3-16.3a.7.7 0 0 0-.1-.8z"/>`,
    'location-outline': '<path d="M20.2 3.8 3.8 11l7 1.9 1.9 7z"/>',
    info: `<circle cx="12" cy="12" r="9"/><path d="M12 11v6"/><circle cx="12" cy="7.6" r="1.1" ${F}/>`,
    photo: '<rect x="2.5" y="4.5" width="19" height="15" rx="3"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m2.5 17 5.5-5 4 4 3-3 6.5 6"/>',
    'photo-stack': '<rect x="2.5" y="7" width="15" height="13" rx="2.5"/><path d="M6.5 4h12a2.5 2.5 0 0 1 2.5 2.5V16"/><path d="m2.5 17.5 4.5-4 3.5 3.5 2.5-2.5 4.5 4"/>',
    headphones: '<path d="M4 15.5V12a8 8 0 0 1 16 0v3.5"/><rect x="3" y="14" width="4.5" height="7" rx="2"/><rect x="16.5" y="14" width="4.5" height="7" rx="2"/>',
    'music-note': '<path d="M9 18V5.5l11-2.5v12.5"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="15.5" r="2.5"/>',
    'music-fill': `<path ${F} d="M20 3v12.5a3 3 0 1 1-1.6-2.6V7.1L9.6 9V18a3 3 0 1 1-1.6-2.6V5.6c0-.5.3-.9.8-1L19 2.1a.8.8 0 0 1 1 .9z"/>`,
    list: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1.2" fill="currentColor"/><circle cx="4.5" cy="12" r="1.2" fill="currentColor"/><circle cx="4.5" cy="18" r="1.2" fill="currentColor"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4"/>',
    'mic-slash': '<rect x="9" y="2.5" width="6" height="11.5" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M3.5 3.5l17 17"/>',
    power: '<path d="M12 3v8.5M7.2 6.2a7.5 7.5 0 1 0 9.6 0"/>',
    house: '<path d="M3.5 11 12 4l8.5 7"/><path d="M5.5 9.5V20h5v-5.5h3V20h5V9.5"/>',
    'square-grid': '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
    gear: '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8 13.6 5l2.7-.6.6 2.7 2.2 1.6-1.2 2.5 1.2 2.5-2.2 1.6-.6 2.7-2.7-.6L12 21.2 10.4 19l-2.7.6-.6-2.7-2.2-1.6L6.1 12 4.9 9.5l2.2-1.6.6-2.7 2.7.6z"/>',
    tabs: '<rect x="3" y="6.5" width="14.5" height="14.5" rx="3"/><path d="M7 3.5h10.5A3.5 3.5 0 0 1 21 7v10"/>',
    book: '<path d="M3 5.5h6a3 3 0 0 1 3 3V20a2.5 2.5 0 0 0-2.5-2.5H3zM21 5.5h-6a3 3 0 0 0-3 3V20a2.5 2.5 0 0 1 2.5-2.5H21z"/>',
    calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/>',
    flag: '<path d="M5 21V4M5 4.5h11.5l-2.2 4 2.2 4H5"/>',
    'flag-fill': `<path d="M5 21V4"/><path ${F} d="M5 4h12a.6.6 0 0 1 .5.9L15.4 8.5l2.1 3.6a.6.6 0 0 1-.5.9H5z"/>`,
    tray: '<path d="M3 13.5 5.5 5h13l2.5 8.5V19a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 19z"/><path d="M3 13.5h5.5a3.5 3.5 0 0 0 7 0H21"/>',
    'calendar-today': '<rect x="3" y="4.5" width="18" height="16.5" rx="3"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4"/><circle cx="12" cy="15" r="2" fill="currentColor"/>',
    'checkmark-circle': '<circle cx="12" cy="12" r="9"/><path d="m8 12.3 2.8 2.8L16.5 9"/>',
    'checkmark-circle-fill': `<path ${F} fill-rule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm4.9-11.4a.9.9 0 0 0-1.3-1.2l-5 5.4-2.2-2.2a.9.9 0 1 0-1.3 1.3l2.9 2.8c.4.4 1 .4 1.3 0z"/>`,
    circle: '<circle cx="12" cy="12" r="9"/>',
    'xmark-circle-fill': `<path ${F} fill-rule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9.2 8a.85.85 0 0 0-1.2 1.2l2.8 2.8L8 14.8A.85.85 0 0 0 9.2 16l2.8-2.8 2.8 2.8a.85.85 0 0 0 1.2-1.2L13.2 12 16 9.2A.85.85 0 0 0 14.8 8L12 10.8z"/>`,
    'minus-circle-fill': `<path ${F} fill-rule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM7.5 11.1a.9.9 0 0 0 0 1.8h9a.9.9 0 0 0 0-1.8z"/>`,
    'plus-circle-fill': `<path ${F} fill-rule="evenodd" d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zm.9-13a.9.9 0 0 0-1.8 0v3.1H8a.9.9 0 0 0 0 1.8h3.1V16a.9.9 0 0 0 1.8 0v-3.1H16a.9.9 0 0 0 0-1.8h-3.1z"/>`,
    delete: '<path d="M8.5 5H20a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 20 19H8.5L2.5 12z"/><path d="m11 9 6 6M17 9l-6 6"/>',
    waveform: '<path d="M3 12h1M6.5 8v8M10 4.5v15M13.5 8v8M17 6v12M20.5 10.5v3"/>',
    'arrow-left': '<path d="M19.5 12h-15M11 5.5 4.5 12l6.5 6.5"/>',
    'arrow-right': '<path d="M4.5 12h15M13 5.5l6.5 6.5-6.5 6.5"/>',
    'doc-text': '<path d="M6.5 2.5h7l5 5V20a1.5 1.5 0 0 1-1.5 1.5H6.5A1.5 1.5 0 0 1 5 20V4a1.5 1.5 0 0 1 1.5-1.5z"/><path d="M13.5 2.5v5h5M8.5 12.5h7M8.5 16h7"/>',
    folder: '<path d="M3 7a2 2 0 0 1 2-2h4.2l2 2.2H19a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
    battery: '<rect x="2.5" y="7" width="17" height="10" rx="2.5"/><path d="M21.5 10.5v3"/><rect x="4.5" y="9" width="10" height="6" rx="1" fill="currentColor"/>',
    hand: '<path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4a1.5 1.5 0 0 1 3 0v6M14 10.5V5.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 7-6 7-2.6 0-4-1.3-5.4-3.4L3.4 14a1.5 1.5 0 0 1 2.5-1.6L8 15"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    textformat: '<path d="M3.5 19 9 5l5.5 14M5.5 14h7M15 19l3-8 3 8M16 16.5h4"/>',
    hourglass: '<path d="M6.5 3h11M6.5 21h11M7.5 3c0 5 9 5 9 9s-9 4-9 9M16.5 3c0 5-9 5-9 9s9 4 9 9"/>',
    accessibility: '<circle cx="12" cy="4.5" r="1.8"/><path d="M4.5 8.5 12 10l7.5-1.5M12 10v4.5M9 21l3-6.5 3 6.5"/>',
    'square-on-square': '<rect x="7.5" y="7.5" width="13" height="13" rx="2.5"/><path d="M16.5 4.5V5A1.5 1.5 0 0 0 15 3.5H5A1.5 1.5 0 0 0 3.5 5v10A1.5 1.5 0 0 0 5 16.5h.5"/>',
    sparkles: `<path ${F} d="M10 3.5c.4 3.5 2 5.6 6 6.5-4 .9-5.6 3-6 6.5-.4-3.5-2-5.6-6-6.5 4-.9 5.6-3 6-6.5zM18 13c.2 1.8 1 2.8 3 3.2-2 .4-2.8 1.4-3 3.3-.2-1.9-1-2.9-3-3.3 2-.4 2.8-1.4 3-3.2z"/>`,
    paperplane: '<path d="M21 3 10.5 13.5M21 3l-6.5 18-4-7.5L3 9.5z"/>',
    'arrow-down-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v9M8 12.5l4 4 4-4"/>',
    'map': '<path d="M9 4 3 6.5v14L9 18l6 2.5 6-2.5v-14L15 6.5z"/><path d="M9 4v14M15 6.5v14"/>',
    car: '<path d="M4 16.5V12l2-5.5h12l2 5.5v4.5"/><path d="M3 12.5h18v4H3z"/><circle cx="7" cy="18" r="1.5"/><circle cx="17" cy="18" r="1.5"/>',
    walk: '<circle cx="13" cy="4.5" r="1.8"/><path d="m9 21 2.5-6.5L14 17v4M11.5 14.5 13 9l-4 2v3.5M13 9l2.5 3H18"/>',
    'fork-knife': '<path d="M7 3v7a2 2 0 0 0 2 2v9M11 3v7a2 2 0 0 1-2 2M9 3v6M17 3c-2 1.5-3 4-3 7h3v11"/>',
    bag: '<path d="M5 8h14l-1 12.5H6z"/><path d="M9 10V6.5a3 3 0 0 1 6 0V10"/>',
    cup: '<path d="M4.5 8h12v6a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5zM16.5 10h1.5a2.5 2.5 0 0 1 0 5h-1.5M8 3.5v2M12 3.5v2"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16M3 21h13M6.5 7.5h6M15 10h2a1.5 1.5 0 0 1 1.5 1.5V17a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    bed: '<path d="M3 19V6M3 15h18v4M21 15v-3a3 3 0 0 0-3-3h-7v6M7 12a2 2 0 1 0 0-.01"/>',
    cloud: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-9A6 6 0 0 1 18 10a4.3 4.3 0 0 1-.5 8.5z"/>',
    drop: '<path d="M12 3.5s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z"/>',
    wind: '<path d="M3 9h11.5a2.8 2.8 0 1 0-2.8-2.8M3 13h15.5a2.8 2.8 0 1 1-2.8 2.8M3 17h8"/>',
    thermometer: '<path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z"/><circle cx="12" cy="17.5" r="1.5" fill="currentColor"/>',
    gauge: '<path d="M4.5 18a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 4-4.5"/>',
    sunrise: '<path d="M3 18h18M6.5 18a5.5 5.5 0 0 1 11 0M12 3.5v4M9.5 6 12 3.5 14.5 6M4.2 11.3l1.4 1.4M19.8 11.3l-1.4 1.4"/>',
    aqi: '<path d="M4 9h9.5a2.5 2.5 0 1 0-2.5-2.5M4 13h14a2.5 2.5 0 1 1-2.5 2.5M4 17h6"/>',
    'arrow-up-arrow-down': '<path d="M7 20V4M3.5 7.5 7 4l3.5 3.5M17 4v16M13.5 16.5 17 20l3.5-3.5"/>',
    'text-bubble': '<path d="M5 4h14a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><path d="M7.5 9h9M7.5 12.5h6"/>',
    'scope': '<circle cx="12" cy="12" r="7.5"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
    'bolt-fill': `<path ${F} d="M13.5 2 4.5 13.5H11L9.5 22l9-11.5H12z"/>`,
    'leaf': '<path d="M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19l7-7"/>',
    'dial': '<circle cx="12" cy="12" r="9"/><path d="M12 7v5"/>',
  };

  /**
   * Returns inline SVG markup for a symbol.
   * @param {string} name
   * @param {object} [o] { size, stroke, cls, style }
   */
  function sym(name, o) {
    o = o || {};
    const body = P[name];
    if (body == null) {
      console.warn('[symbols] unknown symbol', name);
      return '';
    }
    const size = o.size ? ` width="${o.size}" height="${o.size}"` : '';
    const cls = o.cls ? ` class="${o.cls}"` : '';
    const style = o.style ? ` style="${o.style}"` : '';
    const sw = o.stroke || 2;
    return `<svg viewBox="0 0 24 24"${size}${cls}${style} fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  }

  OS.sym = sym;
  OS.symbols = P;
})();
