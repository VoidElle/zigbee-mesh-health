(function () {
  const LANGS = ['it', 'en'];
  const LOCALES = { it: 'it-IT', en: 'en-GB' };
  const catalogs = {};
  const listeners = new Set();

  const detectLang = () => {
    const stored = localStorage.getItem('lang');
    if (LANGS.indexOf(stored) !== -1) return stored;
    return /^it\b/i.test(navigator.language || '') ? 'it' : 'en';
  };

  let currentLang = detectLang();

  const loadCatalog = (lang) => {
    if (catalogs[lang]) return Promise.resolve(catalogs[lang]);
    return fetch(new URL('i18n/' + lang + '.json', document.baseURI))
      .then((r) => r.json())
      .then((data) => {
        catalogs[lang] = data;
        return data;
      })
      .catch(() => ({}));
  };

  const I18n = {
    lang: currentLang,
    locale: LOCALES[currentLang],
    ready: null,

    t(key, params) {
      const catalog = catalogs[I18n.lang] || {};
      const value = catalog[key];
      if (value == null) return key;
      if (!params) return value;
      return value.replace(/\{(\w+)}/g, (m, name) =>
        name in params ? params[name] : m
      );
    },

    getLang() {
      return I18n.lang;
    },

    setLang(lang) {
      if (LANGS.indexOf(lang) === -1) return Promise.resolve();
      return loadCatalog(lang).then(() => {
        I18n.lang = lang;
        I18n.locale = LOCALES[lang];
        document.documentElement.lang = lang;
        localStorage.setItem('lang', lang);
        I18n.apply(document);
        listeners.forEach((fn) => fn(lang));
      });
    },

    apply(root = document) {
      const els = root.querySelectorAll(
        '[data-i18n], [data-i18n-html], [data-i18n-aria-label], [data-i18n-placeholder], [data-i18n-title]'
      );
      els.forEach((el) => {
        const text = el.getAttribute('data-i18n');
        if (text != null) el.textContent = I18n.t(text);
        const html = el.getAttribute('data-i18n-html');
        if (html != null) el.innerHTML = I18n.t(html);
        const aria = el.getAttribute('data-i18n-aria-label');
        if (aria != null) el.setAttribute('aria-label', I18n.t(aria));
        const ph = el.getAttribute('data-i18n-placeholder');
        if (ph != null) el.setAttribute('placeholder', I18n.t(ph));
        const title = el.getAttribute('data-i18n-title');
        if (title != null) el.setAttribute('title', I18n.t(title));
      });
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };

  I18n.ready = loadCatalog(currentLang).then(() => {
    I18n.lang = currentLang;
    I18n.locale = LOCALES[currentLang];
    document.documentElement.lang = currentLang;
    I18n.apply(document);
  });

  window.I18n = I18n;
})();
