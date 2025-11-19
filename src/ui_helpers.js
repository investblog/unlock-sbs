(function (global) {
  function ahCreateIcon(type = 'brand', size = 'md', tone = 'main') {
    const span = document.createElement('span');
    span.className = `ah-icon ah-icon--${size} ah-icon--${tone}`;
    span.setAttribute('aria-hidden', 'true');

    const img = document.createElement('img');
    img.alt = '';
    try {
      img.src = chrome?.runtime?.getURL(`icons/${type}.svg`) ?? `icons/${type}.svg`;
    } catch (_) {
      img.src = `icons/${type}.svg`;
    }

    span.appendChild(img);
    return span;
  }

  global.ahCreateIcon = ahCreateIcon;
})(typeof globalThis !== 'undefined' ? globalThis : window);
