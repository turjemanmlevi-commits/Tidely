/* =====================================================================
   TIDELY storefront prototype
   Vanilla JS + GSAP (ScrollTrigger, Flip, SplitText) + Lenis.
   Every section maps 1:1 to a future Shopify theme section.
   ===================================================================== */
(() => {
  'use strict';

  /* ---------- Setup ---------- */
  const { gsap, ScrollTrigger, Flip, SplitText, CustomEase, Lenis } = window;
  gsap.registerPlugin(ScrollTrigger, Flip, SplitText, CustomEase);
  CustomEase.create('tidely', 'M0,0 C0.16,1 0.3,1 1,1');
  CustomEase.create('tidelyInOut', 'M0,0 C0.65,0 0.35,1 1,1');
  gsap.defaults({ ease: 'tidely', duration: 1 });

  const CONFIG = window.TIDELY_CONFIG;
  // Present only when the page is served by the Shopify theme (see snippets/tidely-data.liquid).
  const SHOP = window.TIDELY_SHOP || null;
  const FEATURED = window.TIDELY_FEATURED || [];
  const rank = (p) => { const i = FEATURED.indexOf(p.metaHandle || p.handle); return i < 0 ? 999 : i; };
  const META = window.TIDELY_PRODUCTS;
  const stripTags = (h) => String(h || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
  const cdn = (u) => (u && u.startsWith('//') ? `https:${u}` : u);

  // Loose text match for handles, tags, titles and variant names ("Gray" = "grey", "Set of 2" = "set-of-2").
  const norm = (x) => String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  // A Shopify product gets the Tidely design when its handle, a "tidely:<handle>" tag or its title matches products.js.
  // This keeps the design when products are imported with DSers under AliExpress handles.
  const metaFor = (sp) => META.find((m) => m.handle === sp.handle)
    || META.find((m) => (sp.tags || []).some((t) => norm(t) === norm(`tidely ${m.handle}`)))
    || META.find((m) => norm(m.title) === norm(sp.title));
  const variantMatches = (val, v) => {
    const hay = ` ${norm(v.options.join(' '))} `;
    return [val.value, ...(val.aliases || [])].some((a) => hay.includes(` ${norm(a)} `));
  };

  // Merge a Shopify product (live price, variants, stock) with the design data kept in products.js.
  function fromShop(sp) {
    const meta = metaFor(sp);
    const imgs = (sp.images || []).map(cdn);
    const variants = (sp.variants || []).map((v) => ({
      id: v.id,
      options: [v.option1, v.option2, v.option3].filter((x) => x != null),
      price: v.price / 100,
      compareAt: v.compare_at_price && v.compare_at_price > v.price ? v.compare_at_price / 100 : null,
      available: v.available,
    }));
    const first = variants.find((v) => v.available) || variants[0] || { price: 0, compareAt: null, id: null };
    const p = meta ? { ...meta } : {
      handle: sp.handle,
      subtitle: sp.type || '',
      collection: ((SHOP.membership || {})[sp.handle] || [])[0] || '',
      card: imgs[0] || '',
      cardAlt: imgs[1] || imgs[0] || '',
      images: imgs.length ? imgs : [''],
      short: stripTags(sp.description).slice(0, 180),
      description: [],
      descriptionHtml: sp.description || '',
      highlights: [],
      materials: '',
      inBox: [],
      care: '',
    };
    p.metaHandle = meta ? meta.handle : null;
    p.handle = sp.handle; // links always use the store's real URL
    p.title = meta ? meta.title : sp.title;
    p.price = first.price;
    p.compareAt = first.compareAt;
    p.variantId = first.id;
    const optNames = (sp.options || []).map((o) => (typeof o === 'string' ? o : o.name));
    const hasOptions = variants.length > 1 || (optNames[0] && optNames[0] !== 'Title');
    if (p.options) {
      p.options = {
        ...p.options,
        values: p.options.values.map((val) => {
          const v = variants.find((x) => variantMatches(val, x));
          return v ? { ...val, price: v.price, compareAt: v.compareAt, available: v.available, variantId: v.id } : { ...val, available: false };
        }),
      };
    } else if (hasOptions) {
      p.options = { name: optNames[0] || 'Option', type: 'size', values: variants.map((v) => ({ value: v.options.join(' / '), price: v.price, compareAt: v.compareAt, available: v.available, variantId: v.id })) };
    }
    return p;
  }
  const shopProducts = () => {
    const list = [...(SHOP.products || [])];
    if (SHOP.current && !list.some((x) => x.handle === SHOP.current.handle)) list.push(SHOP.current);
    return list.map(fromShop);
  };
  const PRODUCTS = (SHOP ? shopProducts() : META.map((p) => ({ ...p }))).sort((a, b) => rank(a) - rank(b));
  const COLLECTIONS = window.TIDELY_COLLECTIONS;
  const ICONS = window.TIDELY_ICONS;
  const PAY = window.TIDELY_PAY;

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const CURRENCY = (SHOP && SHOP.currency) || CONFIG.currency;
  const fmt = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CURRENCY });
  const fmt0 = new Intl.NumberFormat(CONFIG.locale, { style: 'currency', currency: CURRENCY, minimumFractionDigits: 0, maximumFractionDigits: 0 });
  const money = (n) => (Number.isInteger(n) ? fmt0 : fmt).format(n);
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icon = (k) => `<svg viewBox="0 0 256 256" fill="currentColor" aria-hidden="true" focusable="false">${ICONS[k] || ''}</svg>`;
  const ic = (k) => `<i data-icon="${k}">${icon(k)}</i>`;
  // Images: design assets by name (flat theme assets on Shopify, assets/img/ standalone) or full Shopify CDN URLs.
  const ASSET = SHOP ? SHOP.assetBase : 'assets/img/';
  const isUrl = (n) => /^(https?:)?\/\//.test(n || '');
  const sized = (u, w) => `${cdn(u)}${u.includes('?') ? '&' : '?'}width=${w}`;
  const src = (name) => (isUrl(name) ? sized(name, 1200) : `${ASSET}${name}.webp`);
  const srcSm = (name) => (isUrl(name) ? sized(name, 600) : `${ASSET}${name}-sm.webp`);
  const srcset = (name) => `${srcSm(name)} 600w, ${src(name)} 1200w`;

  // Links are written as hash routes; inside Shopify they become real store URLs.
  const POLICY_PATHS = { shipping: 'shipping-policy', returns: 'refund-policy', privacy: 'privacy-policy', terms: 'terms-of-service' };
  const toPath = (hash) => {
    const [path, qs] = hash.replace(/^#/, '').split('?');
    const parts = path.split('/').filter(Boolean);
    const q = qs ? `?${qs}` : '';
    if (!parts.length) return '/';
    if (parts[0] === 'shop') return `${parts[1] ? `/collections/${parts[1]}` : '/collections/all'}${q}`;
    if (parts[0] === 'product') return `/products/${parts[1]}${q}`;
    if (['about', 'faq', 'contact'].includes(parts[0])) return `/pages/${parts[0]}`;
    if (parts[0] === 'policy') return `/policies/${POLICY_PATHS[parts[1]] || parts[1]}`;
    return '/';
  };
  const link = (hash) => (SHOP ? toPath(hash) : hash);
  const setUrl = (hash) => history.replaceState(null, '', link(hash));
  function fixLinks(root = document) {
    if (!SHOP) return;
    $$('a[href^="#/"]', root).forEach((a) => {
      const h = a.getAttribute('href');
      a.setAttribute('href', toPath(h));
      if (h.startsWith('#/policy/')) a.removeAttribute('data-link'); // Shopify renders its own policy pages
    });
  }
  const img = (name, alt, { sizes = '(max-width: 767px) 100vw, 50vw', cls = '', eager = false } = {}) =>
    `<img class="${cls}" src="${src(name)}" srcset="${srcset(name)}" sizes="${sizes}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`;
  const byHandle = (h) => PRODUCTS.find((p) => p.handle === h || p.metaHandle === h);
  // Editorial sections keep their design content even before a product is imported into the store.
  const anyProduct = (h) => byHandle(h) || META.find((m) => m.handle === h);
  const plink = (h) => (byHandle(h) ? `#/product/${byHandle(h).handle}` : '#/shop');
  const collectionOf = (h) => COLLECTIONS.find((c) => c.handle === h);

  const hydrateIcons = (root = document) => $$('i[data-icon]', root).forEach((el) => { if (!el.firstElementChild) el.innerHTML = icon(el.dataset.icon); });

  /* ---------- Smooth scroll ---------- */
  let lenis = null;
  if (!reduced) {
    lenis = new Lenis({ lerp: 0.09, wheelMultiplier: 0.95, touchMultiplier: 1.4 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }
  const lockScroll = (on) => { document.body.classList.toggle('is-locked', on); if (lenis) on ? lenis.stop() : lenis.start(); };
  const scrollTo = (target, opts = {}) => { if (lenis) lenis.scrollTo(target, { duration: 1.4, ...opts }); else (typeof target === 'number' ? window.scrollTo(0, target) : $(target)?.scrollIntoView()); };

  /* ---------- Pricing helpers ---------- */
  const variantOf = (p, value) => {
    const values = p.options?.values || [];
    return values.find((v) => v.value === value) || values.find((v) => v.available !== false) || values[0] || null;
  };
  const priceOf = (p, value) => {
    const v = variantOf(p, value);
    return { price: v?.price ?? p.price, compareAt: v?.compareAt ?? p.compareAt };
  };
  const priceHtml = (p, value) => {
    const { price, compareAt } = priceOf(p, value);
    return `<span class="price">${compareAt ? `<s>${money(compareAt)}</s>` : ''}<span>${money(price)}</span></span>`;
  };
  const fromPrice = (p) => (p.options?.type === 'size' ? `From ${money(Math.min(...p.options.values.map((v) => v.price)))}` : money(p.price));

  /* ---------- Cart state ---------- */
  // Standalone: cart lives in localStorage. Shopify: the real cart via the AJAX Cart API.
  const CART_KEY = 'tidely-cart';
  let cart = [];
  let shopTotal = null;
  if (!SHOP) {
    try { cart = JSON.parse(localStorage.getItem(CART_KEY)) || []; } catch (e) { cart = []; }
    cart = cart.filter((l) => byHandle(l.handle));
  }
  const saveCart = () => { if (SHOP) return; try { localStorage.setItem(CART_KEY, JSON.stringify(cart)); } catch (e) { /* storage unavailable */ } };
  const lineTotal = (l) => (l.linePrice != null ? l.linePrice : priceOf(byHandle(l.handle), l.option).price * l.qty);
  const subtotal = () => (shopTotal != null ? shopTotal : cart.reduce((s, l) => s + lineTotal(l), 0));
  const itemCount = () => cart.reduce((s, l) => s + l.qty, 0);

  const shopFetch = (url, body) => fetch(url, body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify(body) }
    : { headers: { Accept: 'application/json' } }).then((r) => { if (!r.ok) throw r; return r.json(); });
  const mapShopCart = (c) => {
    shopTotal = c.total_price / 100;
    cart = (c.items || []).map((it) => ({
      key: it.key,
      handle: it.handle,
      option: (it.options_with_values || []).filter((o) => o.name !== 'Title').map((o) => o.value).join(' / ') || null,
      qty: it.quantity,
      linePrice: it.final_line_price / 100,
      title: it.product_title,
      image: it.image,
    }));
  };
  async function syncCart() {
    if (!SHOP) return;
    try { mapShopCart(await shopFetch('/cart.js')); } catch (e) { /* keep the last known cart */ }
    renderCart();
  }

  async function addToCart(handle, option, qty = 1, fromEl = null) {
    const p = byHandle(handle);
    const opt = option || p.options?.values.find((v) => v.available !== false)?.value || null;
    if (SHOP) {
      const id = variantOf(p, opt)?.variantId || p.variantId;
      try { await shopFetch('/cart/add.js', { items: [{ id, quantity: qty }] }); }
      catch (e) { toast('That item could not be added. Please try again.'); return; }
      await syncCart();
    } else {
      const key = `${handle}|${opt || ''}`;
      const line = cart.find((l) => l.key === key);
      if (line) line.qty = Math.min(line.qty + qty, 20); else cart.push({ key, handle, option: opt, qty });
      saveCart();
      renderCart();
    }
    const openAfter = () => openDrawer();
    if (fromEl && !reduced && !document.hidden) flyToCart(fromEl, openAfter); else { bumpCount(); openAfter(); }
  }
  async function setQty(key, qty) {
    const q = Math.max(0, Math.min(qty, 20));
    if (SHOP) {
      try { mapShopCart(await shopFetch('/cart/change.js', { id: key, quantity: q })); } catch (e) { /* keep the last known cart */ }
      renderCart();
      return;
    }
    const line = cart.find((l) => l.key === key);
    if (!line) return;
    line.qty = q;
    if (!line.qty) cart = cart.filter((l) => l.key !== key);
    saveCart();
    renderCart();
  }

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = `${ic('check')}<span>${esc(msg)}</span>`;
    t.classList.add('is-on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('is-on'), 2600);
  }

  /* =====================================================================
     COMPONENTS
     ===================================================================== */
  const productCard = (p, { feature = false, sizes } = {}) => {
    const swatches = p.options?.type === 'colour'
      ? `<div class="pcard__swatches" aria-label="${p.options.values.length} colours">${p.options.values.map((v) => `<span style="background:${v.hex}" title="${esc(v.value)}"></span>`).join('')}</div>` : '';
    return `
    <article class="pcard${feature ? ' is-feature' : ''}" data-flip-id="${p.handle}" data-collection="${p.collection}">
      <div class="pcard__media">
        <a class="pcard__link" href="#/product/${p.handle}" data-link aria-label="${esc(p.title)}">
          ${img(p.card, p.title, { sizes: sizes || '(max-width: 767px) 90vw, 30vw' })}
          ${img(p.cardAlt, `${p.title}, another view`, { cls: 'is-alt', sizes: sizes || '(max-width: 767px) 90vw, 30vw' })}
        </a>
        ${p.tag ? `<span class="pcard__tag">${esc(p.tag)}</span>` : ''}
        <button class="pcard__quick" data-quick="${p.handle}" aria-label="Quick add ${esc(p.title)} to bag">${ic('plus')}<span>Quick add</span></button>
      </div>
      <div class="pcard__info">
        <div>
          <h3 class="pcard__title"><a href="#/product/${p.handle}" data-link>${esc(p.title)}</a></h3>
          <p class="pcard__sub">${esc(p.subtitle)}</p>
          ${swatches}
        </div>
        ${p.options?.type === 'size' ? `<span class="price">${fromPrice(p)}</span>` : priceHtml(p)}
      </div>
    </article>`;
  };

  const btn = (label, href, variant = 'solid', attrs = '') =>
    `<a class="btn btn--${variant}" href="${href}" data-link ${attrs}><span>${label}</span><span class="btn__dot">${ic('arrow')}</span></a>`;

  const accordion = (items, open = -1) => `<div class="acc">${items.map((it, i) => `
      <div class="acc__item">
        <button class="acc__btn" aria-expanded="${i === open}" aria-controls="acc-${it.id}" id="accb-${it.id}"><span>${esc(it.q)}</span>${ic('plus')}</button>
        <div class="acc__panel" id="acc-${it.id}" role="region" aria-labelledby="accb-${it.id}" ${i === open ? 'style="height:auto"' : ''}>
          <div class="acc__content">${it.a}</div>
        </div>
      </div>`).join('')}</div>`;

  /* =====================================================================
     PAGES
     ===================================================================== */
  const Pages = {};

  /* ---------- Home ---------- */
  // Hero showcase: one product from each corner of the catalogue.
  const HERO_SLIDES = [
    { handle: 'six-tier-plant-stand', image: 'hero-plant', pos: '50% 42%', alt: 'Black six-tier plant stand filled with trailing plants, books and a woven basket' },
    { handle: 'airtight-snack-organizer', image: 'crop-snack-hosting', pos: '50% 60%', alt: 'Hands setting a snack organizer filled with fruit, nuts, crackers and a dip on a green dinner table' },
    { handle: 'two-tier-under-sink-organizer', image: 'crop-sink-cabinet', pos: '80% 60%', alt: 'Two white pull-out organizers holding towels and soaps under a bathroom sink' },
    { handle: 'three-tier-spice-rack', image: 'crop-spice-counter', pos: '50% 50%', alt: 'Silver spice rack with angled rows of glass jars on a marble counter' },
    { handle: 'expandable-drawer-organizer', image: 'crop-expdrawer-flat', pos: '0% 50%', alt: 'White expandable drawer organizer holding rolled socks and lingerie on green linen' },
  ];

  // Snack organizer anatomy: hotspot positions are percentages of crop-snack-top.
  const ANATOMY = [
    { x: 30, y: 17, title: 'Clear, sealing lid', text: 'The clear lid shows what is inside at a glance and closes tight, so snacks stay fresh in the fridge.' },
    { x: 92, y: 60, title: 'Four locking clips', text: 'A clip on every side keeps the lid shut when you carry the box from the fridge to the table.' },
    { x: 50, y: 60, title: 'Central dip bowl', text: 'A round bowl in the middle keeps hummus, dips and spreads away from the crunchy things.' },
    { x: 24, y: 43, title: 'Removable compartments', text: 'Lift out any section to refill it or wash it on its own.' },
    { x: 82, y: 87, title: '31 × 24 × 7 cm', text: 'Sized to slide onto a standard fridge shelf and to sit neatly in the middle of the table.' },
  ];

  Pages.home = () => {
    const first = anyProduct(HERO_SLIDES[0].handle);
    const service = [
      { icon: 'truck', title: `Free shipping over ${money(CONFIG.freeShippingFrom)}`, text: `Orders under ${money(CONFIG.freeShippingFrom)} ship for ${money(CONFIG.shippingCost)}.` },
      { icon: 'returns', title: `${CONFIG.returnDays}-day returns`, text: 'Changed your mind? Send it back.' },
      { icon: 'lock', title: 'Secure checkout', text: 'Card, PayPal and Apple Pay.' },
      { icon: 'chat', title: 'Real people', text: 'Write to us and a person replies.' },
    ];
    const stack = [
      { icon: 'grid', title: 'Holds its shape', text: 'Reinforced board keeps every compartment upright, even when a section is half empty.', image: 'crop-drawer-pair', link: 'drawer-organizer-17-grid' },
      { icon: 'fold', title: 'Folds flat when you do not need it', text: 'Our fabric organizers collapse flat, so they never take up the space they were meant to save.', image: 'crop-underbed-fold', link: 'under-bed-storage-bag' },
      { icon: 'drop', title: 'Wipes clean', text: 'Water-resistant trim on the Vanity Bag turns a spilled toner into a quick wipe, not a ruined bag.', image: 'crop-grey-bag', link: 'stand-up-mesh-vanity-bag' },
      { icon: 'plug', title: 'A place for every cable', text: 'Elastic loops and mesh pockets keep chargers, earbuds and drives apart, so the one you need is easy to find.', image: 'crop-tech-open', link: 'double-layer-tech-organizer' },
    ];
    return `
    <section class="hero" data-section="hero">
      <div class="hero__bg"></div>
      <div class="wrap hero__grid">
        <div class="hero__copy">
          <span class="eyebrow hero__eyebrow" data-hero-fade>Organizers &amp; home essentials</span>
          <h1 class="hero__title" id="heroTitle">Everything in its <em>place.</em></h1>
          <p class="hero__sub" data-hero-fade>Organizers for kitchens, wardrobes and suitcases. Designed to make everyday life a little calmer.</p>
          <div class="hero__ctas" data-hero-fade>
            ${btn('Shop the collection', '#/shop', 'solid', 'data-magnetic')}
            <a class="link-underline" href="#/about" data-link>Our story ${ic('arrow')}</a>
          </div>
        </div>
        <div class="hero__media" id="heroMedia">
          <div class="hshow" id="hshow">
            <div class="hshow__ring" aria-hidden="true"></div>
            <div class="hshow__arch">
              ${HERO_SLIDES.map((s, i) => `<figure class="hshow__slide" data-i="${i}"${i ? ' aria-hidden="true"' : ''}><img src="${src(s.image)}" srcset="${srcset(s.image)}" sizes="(max-width: 900px) 80vw, 36vw" alt="${esc(s.alt)}" style="object-position:${s.pos}" ${i === 0 ? 'fetchpriority="high"' : ''} decoding="async"></figure>`).join('')}
            </div>
            <a class="hshow__card" id="hCard" href="${plink(HERO_SLIDES[0].handle)}" data-link>
              <span class="hshow__line"><span class="hshow__cat" id="hCat">${collectionOf(first.collection).title}</span></span>
              <span class="hshow__line"><span class="hshow__name" id="hName">${esc(first.title)}</span></span>
              <span class="hshow__foot"><span class="hshow__line"><span class="price" id="hPrice">${byHandle(first.handle) ? fromPrice(first) : 'View collection'}</span></span><span class="hshow__go">${icon('arrowUp')}</span></span>
            </a>
            <div class="hshow__bars" role="tablist" aria-label="Featured products">
              ${HERO_SLIDES.map((s, i) => `<button role="tab" aria-selected="${i === 0}" aria-label="Show ${esc(anyProduct(s.handle).title)}" data-go="${i}"><span><i></i></span></button>`).join('')}
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="service" id="service" aria-label="Shopping with Tidely">
      <div class="wrap service__grid">
        ${service.map((x) => `<div class="service__item"><span class="service__icon">${ic(x.icon)}</span><div><h3>${x.title}</h3><p>${x.text}</p></div></div>`).join('')}
      </div>
    </section>

    <section class="section" data-section="spaces">
      <div class="wrap">
        <div class="head">
          <h2 class="h-xl" data-split>Shop by space</h2>
          <p data-reveal>Start with the corner of your home that bothers you most.</p>
        </div>
        <div class="spaces" id="spaces">
          ${COLLECTIONS.map((c, i) => {
            const n = PRODUCTS.filter((p) => p.collection === c.handle).length;
            return `<a class="space${i === 0 ? ' is-open' : ''}" href="#/shop/${c.handle}" data-link>
              <img src="${src(c.image)}" srcset="${srcset(c.image)}" sizes="(max-width: 899px) 100vw, 60vw" alt="${esc(c.title)} by Tidely" style="object-position:${c.pos || '50% 50%'}" loading="lazy" decoding="async">
              <span class="space__shade" aria-hidden="true"></span>
              <div class="space__body">
                <div class="space__line"><span class="space__count">${n} ${n === 1 ? 'piece' : 'pieces'}</span></div>
                <div class="space__line"><h3 class="space__title">${c.title}</h3></div>
                <div class="space__more"><div>
                  <p class="space__blurb">${esc(c.blurb)}</p>
                  <span class="space__cta">Shop ${esc(c.title)}<span class="space__dot">${icon('arrowUp')}</span></span>
                </div></div>
              </div>
            </a>`;
          }).join('')}
        </div>
      </div>
    </section>

    <section class="hscroll" id="collection" data-section="collection">
      <div class="hscroll__pin">
        <div class="wrap hscroll__top">
          <div class="head" style="margin-bottom:0">
            <span class="eyebrow" data-reveal>The collection</span>
            <h2 class="h-xl" data-split>Pieces you reach for <em>every day.</em></h2>
          </div>
        </div>
        <div class="hscroll__track" id="hTrack">
          ${PRODUCTS.map((p) => productCard(p, { sizes: '(max-width: 767px) 78vw, 24vw' })).join('')}
          <a class="hscroll__end" href="#/shop" data-link><span>Shop the collection</span>${ic('arrow')}</a>
        </div>
        <div class="hscroll__progress" aria-hidden="true"><span id="hProgress"></span></div>
      </div>
    </section>

    <section class="section" data-section="anatomy">
      <div class="wrap anatomy">
        <div class="anatomy__stage" id="anatomy" data-reveal="clip">
          <img src="${src('crop-snack-top')}" srcset="${srcset('crop-snack-top')}" sizes="(max-width: 900px) 100vw, 55vw" alt="Top view of the Airtight Snack Organizer filled with almonds, olives, cranberries, cheese, crackers, walnuts, apricots, pistachios and hummus" loading="lazy" decoding="async">
          <span class="anatomy__spot" aria-hidden="true"></span>
          ${ANATOMY.map((a, i) => `<button class="hotspot${i === 0 ? ' is-active' : ''}" style="left:${a.x}%;top:${a.y}%" data-spot="${i}" aria-label="${esc(a.title)}" aria-pressed="${i === 0}"><span class="hotspot__ring" aria-hidden="true"></span>${icon('plus')}</button>`).join('')}
        </div>
        <div class="anatomy__copy">
          <h2 class="h-xl" data-split>One box, <em>every snack.</em></h2>
          <p class="lede" data-reveal>Tap a point on the photo to see how the Airtight Snack Organizer keeps every snack fresh and separate.</p>
          <ul class="features" data-reveal>
            ${ANATOMY.map((a, i) => `<li class="feature${i === 0 ? ' is-active' : ''}"><button class="feature__btn" data-spot="${i}" aria-expanded="${i === 0}">${esc(a.title)}</button><div class="feature__more"><p>${esc(a.text)}</p></div></li>`).join('')}
          </ul>
          <div class="anatomy__buy" data-reveal>${btn('Shop the snack organizer', plink('airtight-snack-organizer'), 'solid', 'data-magnetic')}${byHandle('airtight-snack-organizer') ? `<span class="price">${money(byHandle('airtight-snack-organizer').price)}</span>` : ''}</div>
        </div>
      </div>
    </section>

    <section class="section statement" data-section="statement">
      <div class="wrap">
        <p id="statement">A tidy home is not about owning less. It is about giving the things you use every day a <em>proper place.</em></p>
      </div>
    </section>

    <section data-section="details">
      <div class="wrap head" style="margin-bottom:0;padding-top:var(--section)">
        <span class="eyebrow" data-reveal>Small details</span>
        <h2 class="h-xl" data-split>The difference is in <em>how it is made.</em></h2>
      </div>
      <div class="stack" id="stack">
        ${stack.map((s, i) => `
        <div class="stack__card" style="--i:${i}">
          <div class="stack__inner">
            <span class="stack__shade" aria-hidden="true"></span>
            <div class="stack__media">${img(s.image, s.title, { sizes: '(max-width: 900px) 90vw, 45vw' })}</div>
            <div class="stack__copy">
              <span class="stack__icon">${ic(s.icon)}</span>
              <h3 class="h-lg">${s.title}</h3>
              <p>${s.text}</p>
              <a class="link-underline" href="${plink(s.link)}" data-link>${esc(anyProduct(s.link).title)} ${ic('arrow')}</a>
            </div>
          </div>
        </div>`).join('')}
      </div>
    </section>

    <section class="section" data-section="compare">
      <div class="wrap compare">
        <div class="compare__stage" id="compare" data-reveal="clip" style="--pos:50%">
          <img src="${src('crop-shoe-before')}" alt="Suede boot toe before cleaning, dusty and patchy" loading="lazy" decoding="async">
          <img class="compare__after" src="${src('crop-shoe-after')}" alt="The same suede boot after cleaning with the Tidely kit" loading="lazy" decoding="async">
          <span class="compare__label compare__label--before">Before</span>
          <span class="compare__label compare__label--after">After</span>
          <div class="compare__handle"><span class="compare__knob">${icon('compare')}</span></div>
          <input class="compare__range" type="range" min="0" max="100" value="50" aria-label="Compare before and after cleaning">
        </div>
        <div class="compare__copy">
          <h2 class="h-xl" data-split>Suede, <em>brought back.</em></h2>
          <p class="lede" data-reveal>Dust and scuffs flatten suede and dull its colour. A few passes with the brush and pad lift the dirt and raise the nap again.</p>
          <ul class="kit-list" data-reveal>
            <li><span class="n">i</span><div><b>Cleaning brush</b><span>Nylon bristles sweep away everyday dust.</span></div></li>
            <li><span class="n">ii</span><div><b>Protective cover</b><span>Snaps on so the brush stays clean in a bag.</span></div></li>
            <li><span class="n">iii</span><div><b>Rubber cleaning pad</b><span>Lifts stubborn marks and restores the nap.</span></div></li>
          </ul>
          <div data-reveal>${btn('Shop the suede kit', plink('suede-care-kit'), 'solid', 'data-magnetic')}</div>
        </div>
      </div>
    </section>

    <section class="section" style="padding-top:0" data-section="newsletter">
      <div class="wrap">
        <div class="news" data-reveal="clip">
          <span class="news__leaf" aria-hidden="true">${icon('leaf')}</span>
          <div>
            <h2 class="h-xl">A small welcome gift</h2>
            <p>Join the Tidely list and get 10% off your first order, plus new arrivals and the occasional tip on keeping things in order. Unsubscribe any time.</p>
          </div>
          <form class="news__form" id="newsForm" novalidate${SHOP ? ' method="post" action="/contact#newsletter" accept-charset="UTF-8"' : ''}>
            ${SHOP ? '<input type="hidden" name="form_type" value="customer"><input type="hidden" name="utf8" value="✓"><input type="hidden" name="contact[tags]" value="newsletter">' : ''}
            <label for="newsEmail">Email address</label>
            <div class="news__row">
              <input id="newsEmail" type="email" name="${SHOP ? 'contact[email]' : 'email'}" autocomplete="email" placeholder="you@example.com" required>
              <button class="btn btn--dark" type="submit"><span>Subscribe</span><span class="btn__dot">${ic('arrow')}</span></button>
            </div>
            <p class="news__help" id="newsHelp" aria-live="polite"></p>
          </form>
        </div>
      </div>
    </section>`;
  };

  /* ---------- Shop / collection ---------- */
  const ALL_BLURB = 'Considered pieces for kitchens, wardrobes and suitcases, and for the pets you share your home with.';
  Pages.shop = ({ collection }) => {
    const c = collectionOf(collection);
    const title = c ? c.title : 'Shop all';
    const blurb = c ? c.blurb : ALL_BLURB;
    return `
    <section class="page-head">
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/" data-link>Home</a><span>/</span><span aria-current="page">Shop</span></nav>
        <div class="head" style="margin-bottom:0">
          <h1 class="h-display" id="shopTitle" data-split>${title}</h1>
          <p class="lede" id="shopBlurb" data-reveal>${blurb}</p>
        </div>
      </div>
    </section>
    <section class="wrap" style="padding-bottom:var(--section)">
      <div class="toolbar">
        <div class="chips" role="group" aria-label="Filter by space">
          <button class="chip${!c ? ' is-active' : ''}" data-filter="all">All</button>
          ${COLLECTIONS.map((x) => `<button class="chip${c?.handle === x.handle ? ' is-active' : ''}" data-filter="${x.handle}">${x.title}</button>`).join('')}
        </div>
        <label class="select">Sort
          <select id="sort" aria-label="Sort products">
            <option value="featured">Featured</option>
            <option value="price-asc">Price, low to high</option>
            <option value="price-desc">Price, high to low</option>
          </select>${ic('caret')}
        </label>
      </div>
      <div class="grid-products" id="grid"></div>
      <nav class="pager" id="pager" aria-label="Product pages" hidden></nav>
      <div class="empty" id="empty" hidden><h2 class="h-md">Nothing here yet</h2><p>This space is waiting for its first piece.</p><button class="btn btn--ghost" data-filter="all"><span>Show everything</span></button></div>
    </section>`;
  };

  /* ---------- Product ---------- */
  Pages.product = ({ handle, query }) => {
    const p = byHandle(handle);
    if (!p) return Pages.notFound();
    const c = collectionOf(p.collection) || { handle: '', title: 'Shop all' };
    const selected = variantOf(p, query.get('colour') || query.get('size'))?.value || null;
    const start = selected && p.options?.values.find((v) => v.value === selected)?.image;
    const startIdx = start ? Math.max(0, p.images.indexOf(start)) : 0;
    const others = PRODUCTS.filter((x) => x.handle !== p.handle);
    const related = [...others.filter((x) => x.collection === p.collection), ...others.filter((x) => x.collection !== p.collection)].slice(0, 3);
    const details = p.images.filter((n) => !n.startsWith('crop-')).slice(1, 4);
    const optionsHtml = p.options ? `
      <div class="opt">
        <p class="opt__label">${p.options.name}: <b id="optName">${esc(selected)}</b></p>
        ${p.options.type === 'colour'
          ? `<div class="swatches" role="group" aria-label="${p.options.name}">${p.options.values.map((v) => `<button class="swatch${v.available === false ? ' is-soldout' : ''}" aria-pressed="${v.value === selected}" data-opt="${esc(v.value)}" aria-label="${esc(v.value)}${v.available === false ? ', sold out' : ''}"><span class="swatch__chip" style="background:${v.hex}"></span>${esc(v.value)}</button>`).join('')}</div>`
          : `<div class="sizes" role="group" aria-label="${p.options.name}">${p.options.values.map((v) => `<button class="size${v.available === false ? ' is-soldout' : ''}" aria-pressed="${v.value === selected}" data-opt="${esc(v.value)}">${esc(v.value)}</button>`).join('')}</div>`}
      </div>` : '';
    const { price, compareAt } = priceOf(p, selected);
    return `
    <section class="pdp" data-handle="${p.handle}">
      <div class="wrap">
        <nav class="crumbs" aria-label="Breadcrumb"><a href="#/shop" data-link>Shop</a><span>/</span><a href="#/shop/${c.handle}" data-link>${c.title}</a><span>/</span><span aria-current="page">${esc(p.title)}</span></nav>
        <div class="pdp__grid">
          <div class="gallery">
            <div class="gallery__thumbs" role="tablist" aria-label="Product images">
              ${p.images.map((n, i) => `<button class="gallery__thumb${i === startIdx ? ' is-active' : ''}" role="tab" aria-selected="${i === startIdx}" data-idx="${i}" aria-label="Image ${i + 1} of ${p.images.length}"><img src="${srcSm(n)}" alt="" loading="lazy" decoding="async"></button>`).join('')}
            </div>
            <div class="gallery__main" id="galleryMain" data-reveal="clip">
              ${img(p.images[startIdx], `${p.title}, image ${startIdx + 1}`, { sizes: '(max-width: 900px) 100vw, 55vw', eager: true })}
              <div class="gallery__nav"><button id="gPrev" aria-label="Previous image">${ic('caretL')}</button><button id="gNext" aria-label="Next image">${ic('caretR')}</button></div>
            </div>
          </div>
          <div class="pinfo">
            <div style="display:grid;gap:1rem">
              ${p.tag ? `<span class="eyebrow">${esc(p.tag)}</span>` : ''}
              <h1 class="pinfo__title" data-split>${esc(p.title)}</h1>
              <div class="pinfo__price" id="pPrice">${compareAt ? `<s>${money(compareAt)}</s>` : ''}<span>${money(price)}</span>${compareAt ? `<span class="save">Save ${Math.round((1 - price / compareAt) * 100)}%</span>` : ''}</div>
            </div>
            <p class="pinfo__lede" data-reveal>${esc(p.short)}</p>
            ${optionsHtml}
            <div class="buy" id="buy">
              <div class="qty" role="group" aria-label="Quantity"><button data-q="-1" aria-label="Decrease quantity">${ic('minus')}</button><output id="qty">1</output><button data-q="1" aria-label="Increase quantity">${ic('plus')}</button></div>
              <button class="btn btn--solid btn--block" id="addBtn" data-magnetic><span>Add to bag</span><span class="btn__dot">${ic('bag')}</span></button>
            </div>
            <div class="perks">
              <div>${ic('truck')}<span>Free shipping over ${money(CONFIG.freeShippingFrom)}. Delivery in ${CONFIG.deliveryTime}.</span></div>
              <div>${ic('returns')}<span>${CONFIG.returnDays}-day returns on unused items.</span></div>
              <div>${ic('lock')}<span>Secure checkout. Prices include VAT.</span></div>
            </div>
            ${accordion([
              { id: 'desc', q: 'Description', a: p.description.length ? p.description.map((t) => `<p>${esc(t)}</p>`).join('') : (p.descriptionHtml || `<p>${esc(p.short)}</p>`) },
              ...(p.highlights.length ? [{ id: 'feat', q: 'Features', a: `<ul>${p.highlights.map((h) => `<li>${esc(h)}</li>`).join('')}</ul>` }] : []),
              ...(p.materials || p.inBox.length ? [{ id: 'box', q: 'Materials & what is included', a: `<p>${esc(p.materials)}</p><ul>${p.inBox.map((h) => `<li>${esc(h)}</li>`).join('')}</ul><p>${esc(p.care)}</p>` }] : []),
              { id: 'ship', q: 'Shipping & returns', a: `<p>Orders over ${money(CONFIG.freeShippingFrom)} ship free. Below that, shipping is ${money(CONFIG.shippingCost)}. Estimated delivery is ${CONFIG.deliveryTime}.</p><p>You can return unused items within ${CONFIG.returnDays} days of delivery. <a href="#/policy/returns" data-link class="gold">Read the returns policy</a>.</p>` },
            ], 0)}
          </div>
        </div>
      </div>
    </section>

    ${details.length ? `
    <section class="section">
      <div class="wrap">
        <div class="head"><h2 class="h-xl" data-split>A closer look</h2></div>
        <div class="detail-band" data-count="${details.length}">${details.map((n, i) => `<figure data-reveal="clip">${img(n, `${p.title}, detail ${i + 1}`, { sizes: i === 2 ? '100vw' : '(max-width: 767px) 100vw, 55vw' })}</figure>`).join('')}</div>
      </div>
    </section>` : ''}

    <section class="section" style="padding-top:${details.length ? '0' : 'var(--section)'}">
      <div class="wrap">
        <div class="head"><h2 class="h-lg" data-split>You may also like</h2></div>
        <div class="related">${related.map((x) => productCard(x)).join('')}</div>
      </div>
    </section>

    <div class="sticky-buy" id="stickyBuy" aria-hidden="true">
      <img src="${srcSm(p.card)}" alt="">
      <div class="sticky-buy__t"><b>${esc(p.title)}</b><span id="stickyPrice">${money(price)}</span></div>
      <button class="btn btn--solid" id="stickyAdd" tabindex="-1"><span>Add to bag</span><span class="btn__dot">${ic('bag')}</span></button>
    </div>`;
  };

  /* ---------- About ---------- */
  Pages.about = () => `
    <section class="page-head">
      <div class="wrap about-hero">
        <div class="head" style="margin-bottom:0">
          <h1 class="h-display" data-split>Small things, <em>properly kept.</em></h1>
          <p class="lede" data-reveal>Tidely started with a simple idea: the things you use every day deserve a proper place.</p>
        </div>
        <figure data-reveal="clip">${img('crop-drawer', 'A Tidely drawer organizer with rolled socks in neat rows', { sizes: '(max-width: 900px) 100vw, 45vw', eager: true })}</figure>
      </div>
    </section>
    <section class="section">
      <div class="wrap prose" data-reveal>
        <p>A drawer where every pair of socks is visible. A suitcase that stays packed the way you packed it. A bathroom counter without a pile of brushes. Shoes that still look good in their third winter.</p>
        <p>None of it is complicated. It just needs the right piece in the right place. That is what we look for: simple, well-made organizers that solve one everyday problem and then quietly get out of the way.</p>
      </div>
    </section>
    <section class="section" style="padding-top:0">
      <div class="wrap">
        <div class="head"><h2 class="h-xl" data-split>What we care about</h2></div>
        <div class="values">
          <div class="value" data-reveal>${ic('sparkle')}<h3 class="h-md">Made for daily use</h3><p>We choose pieces you reach for every day, not gadgets that end up at the back of a cupboard.</p>${img('crop-colour-row', 'Five Vanity Bags in a row', { sizes: '(max-width: 900px) 100vw, 55vw' })}</div>
          <div class="value" data-reveal>${ic('fold')}<h3 class="h-md">Designed to fold away</h3><p>Almost everything we sell folds flat, so storage never needs storage of its own.</p></div>
          <div class="value" data-reveal>${ic('leaf')}<h3 class="h-md">Fair, clear prices</h3><p>Prices include VAT, shipping is free over ${money(CONFIG.freeShippingFrom)} and returns are simple.</p></div>
        </div>
        <div style="margin-top:3rem" data-reveal>${btn('Shop the collection', '#/shop', 'solid', 'data-magnetic')}</div>
      </div>
    </section>`;

  /* ---------- FAQ ---------- */
  const FAQ = [
    { id: 'shipping', title: 'Orders & shipping', items: [
      { q: 'Where do you ship?', a: '<p>We ship to Spain and most of the European Union. The countries available for your order are shown at checkout.</p>' },
      { q: 'How long does delivery take?', a: `<p>Most orders arrive in ${CONFIG.deliveryTime}. You will receive a tracking link by email as soon as your order ships.</p>` },
      { q: 'How much does shipping cost?', a: `<p>Shipping is free on orders over ${money(CONFIG.freeShippingFrom)}. Below that, it costs ${money(CONFIG.shippingCost)}.</p>` },
    ] },
    { id: 'returns', title: 'Returns & refunds', items: [
      { q: 'What is your return policy?', a: `<p>You can return unused items in their original packaging within ${CONFIG.returnDays} days of delivery.</p>` },
      { q: 'How do I start a return?', a: `<p>Email <a class="gold" href="mailto:${CONFIG.email}">${CONFIG.email}</a> with your order number and we will send you the next steps.</p>` },
      { q: 'When will I get my refund?', a: '<p>Refunds go back to your original payment method within 14 days of us receiving the return.</p>' },
    ] },
    { id: 'products', title: 'Products', items: [
      { q: 'Which under-bed bag size do I need?', a: '<p>Choose L for blankets, throws and folded clothes. Choose XL for duvets and bulky bedding.</p>' },
      { q: 'Can the Vanity Bag go in hand luggage?', a: '<p>Yes, it fits easily in a carry-on. Liquids still need to follow your airline’s rules.</p>' },
      { q: 'How do I clean my organizers?', a: '<p>Wipe fabric and EVA pieces with a damp cloth and let them air-dry. Care details are on each product page.</p>' },
    ] },
    { id: 'payment', title: 'Payment', items: [
      { q: 'Which payment methods do you accept?', a: '<p>Visa, Mastercard, American Express, PayPal, Apple Pay and Google Pay.</p>' },
      { q: 'Do prices include VAT?', a: '<p>Yes. All prices include VAT, so the price you see is the price you pay, plus shipping on orders under the free shipping threshold.</p>' },
    ] },
  ];
  Pages.faq = () => `
    <section class="page-head">
      <div class="wrap head" style="margin-bottom:0">
        <h1 class="h-display" data-split>How can we help?</h1>
        <p class="lede" data-reveal>Answers to the questions we hear most. If yours is not here, <a class="gold" href="#/contact" data-link>send us a message</a>.</p>
      </div>
    </section>
    <section class="wrap faq-grid" style="padding-bottom:var(--section)">
      <nav class="faq-nav" aria-label="FAQ topics">${FAQ.map((g) => `<button data-scroll="#faq-${g.id}" style="text-align:left" class="faq-nav__btn"><span class="muted">${g.title}</span></button>`).join('')}</nav>
      <div>${FAQ.map((g) => `<div class="faq-group" id="faq-${g.id}" data-reveal><h2>${g.title}</h2>${accordion(g.items.map((it, i) => ({ ...it, id: `${g.id}-${i}` })))}</div>`).join('')}</div>
    </section>`;

  /* ---------- Contact ---------- */
  Pages.contact = () => `
    <section class="page-head">
      <div class="wrap contact">
        <div style="display:grid;gap:2rem">
          <div class="head" style="margin-bottom:0">
            <h1 class="h-display" data-split>Get in touch</h1>
            <p class="lede" data-reveal>Questions about an order, a product or a return? Send us a message and we will get back to you.</p>
          </div>
          <div class="contact__info" data-reveal>
            <div>${ic('mail')}<p><b>Email</b><br><a class="gold" href="mailto:${CONFIG.email}">${CONFIG.email}</a></p></div>
            <div>${ic('clock')}<p><b>Hours</b><br><span class="muted">Monday to Friday, 9:00 to 18:00 CET</span></p></div>
          </div>
        </div>
        <form class="form" id="contactForm" novalidate data-reveal="clip"${SHOP ? ' method="post" action="/contact" accept-charset="UTF-8"' : ''}>
          ${SHOP ? '<input type="hidden" name="form_type" value="contact"><input type="hidden" name="utf8" value="✓">' : ''}
          <div class="field"><label for="cName">Name</label><input id="cName" name="${SHOP ? 'contact[name]' : 'name'}" autocomplete="name" required><small></small></div>
          <div class="field"><label for="cEmail">Email</label><input id="cEmail" name="${SHOP ? 'contact[email]' : 'email'}" type="email" autocomplete="email" required><small></small></div>
          <div class="field"><label for="cOrder">Order number (optional)</label><input id="cOrder" name="${SHOP ? 'contact[order_number]' : 'order'}" inputmode="numeric"><small>You will find it in your confirmation email.</small></div>
          <div class="field"><label for="cMsg">Message</label><textarea id="cMsg" name="${SHOP ? 'contact[body]' : 'message'}" required></textarea><small></small></div>
          <button class="btn btn--dark" type="submit" style="justify-self:start"><span>Send message</span><span class="btn__dot">${ic('send')}</span></button>
        </form>
      </div>
    </section>
    <div style="height:var(--section)"></div>`;

  /* ---------- Policies ---------- */
  const POLICIES = {
    shipping: { title: 'Shipping policy', body: `
      <p>We ship to Spain and most of the European Union. Available countries are shown at checkout.</p>
      <h2>Costs</h2><p>Shipping is free on orders over ${money(CONFIG.freeShippingFrom)}. Orders below that ship for ${money(CONFIG.shippingCost)}.</p>
      <h2>Delivery times</h2><p>Orders are processed within 1 to 2 business days. Estimated delivery is ${CONFIG.deliveryTime} after dispatch. You will receive a tracking link by email once your order ships.</p>` },
    returns: { title: 'Returns & refunds', body: `
      <p>You have ${CONFIG.returnDays} days from delivery to return any unused item in its original packaging.</p>
      <h2>How to return</h2><p>Email <a href="mailto:${CONFIG.email}">${CONFIG.email}</a> with your order number. We will reply with the return address and instructions.</p>
      <h2>Refunds</h2><p>Once we receive and check your return, we refund the original payment method within 14 days. Original shipping costs are refunded when the whole order is returned.</p>
      <h2>Damaged or wrong items</h2><p>If something arrives damaged or is not what you ordered, write to us within 48 hours with a photo and we will make it right.</p>` },
    privacy: { title: 'Privacy policy', body: `
      <p>We only collect the information we need to process your order and, if you subscribe, to send you our newsletter.</p>
      <h2>What we collect</h2><p>Your name, email, shipping address and order details. Payments are handled by our payment providers; we never see or store your full card number.</p>
      <h2>Your rights</h2><p>You can ask us to access, correct or delete your data at any time by emailing <a href="mailto:${CONFIG.email}">${CONFIG.email}</a>.</p>` },
    terms: { title: 'Terms of service', body: `
      <p>By placing an order with Tidely you agree to these terms.</p>
      <h2>Prices</h2><p>All prices are in euros and include VAT. We may change prices at any time, but changes never affect orders already placed.</p>
      <h2>Orders</h2><p>We confirm every order by email. We may cancel an order if an item is out of stock or a pricing error occurred, and we refund you in full if so.</p>` },
  };
  Pages.policy = ({ id }) => {
    const pol = POLICIES[id];
    if (!pol) return Pages.notFound();
    return `
    <section class="page-head"><div class="wrap head" style="margin-bottom:0"><h1 class="h-display" data-split>${pol.title}</h1></div></section>
    <section class="wrap" style="padding-bottom:var(--section)"><div class="prose" data-reveal>${pol.body}</div></section>`;
  };

  Pages.notFound = () => `
    <section class="page-head" style="min-height:70dvh;display:grid;align-content:center">
      <div class="wrap head">
        <h1 class="h-display" data-split>This page is <em>out of place.</em></h1>
        <p class="lede" data-reveal>The link may be old, or the page has moved. Everything else is right where it should be.</p>
        <div data-reveal>${btn('Shop the collection', '#/shop')}</div>
      </div>
    </section>`;

  /* ---------- Footer (rendered once) ---------- */
  function renderFooter() {
    const pay = ['visa', 'mastercard', 'amex', 'paypal', 'applepay', 'googlepay'].map((k) => PAY[k] ? `<span title="${PAY[k].title}"><svg viewBox="0 0 24 24" role="img" aria-label="${PAY[k].title}"><path d="${PAY[k].path}"/></svg></span>` : '').join('');
    $('#footer').innerHTML = `
      <div class="wrap footer__grid">
        <div class="footer__brand">
          <a href="#/" data-link class="logo" style="margin:0;justify-self:start">TIDELY</a>
          <p>Considered organizers for drawers, suitcases, shelves and shoes. Everything in its place.</p>
          <div class="socials">
            <a href="#/" data-link aria-label="Tidely on Instagram">${ic('instagram')}</a>
            <a href="#/" data-link aria-label="Tidely on TikTok">${ic('tiktok')}</a>
            <a href="#/" data-link aria-label="Tidely on Pinterest">${ic('pinterest')}</a>
          </div>
        </div>
        <div><h4>Shop</h4><ul>${COLLECTIONS.map((c) => `<li><a href="#/shop/${c.handle}" data-link>${c.title}</a></li>`).join('')}<li><a href="#/shop" data-link>Shop all</a></li></ul></div>
        <div><h4>Help</h4><ul><li><a href="#/faq" data-link>FAQ</a></li><li><a href="#/policy/shipping" data-link>Shipping</a></li><li><a href="#/policy/returns" data-link>Returns</a></li><li><a href="#/contact" data-link>Contact</a></li></ul></div>
        <div><h4>Tidely</h4><ul><li><a href="#/about" data-link>Our story</a></li><li><a href="#/policy/privacy" data-link>Privacy</a></li><li><a href="#/policy/terms" data-link>Terms</a></li></ul></div>
      </div>
      <div class="wrap footer__bottom">
        <span>© ${new Date().getFullYear()} Tidely. Prices include VAT.</span>
        <div class="pay" aria-label="Accepted payment methods">${pay}</div>
      </div>
      <div class="footer__word" aria-hidden="true" id="footerWord">${'TIDELY'.split('').map((l) => `<span>${l}</span>`).join('')}</div>`;
  }

  /* =====================================================================
     ANIMATION HELPERS
     ===================================================================== */
  function splitHeadings(root) {
    $$('[data-split]', root).forEach((el) => {
      if (reduced) return;
      SplitText.create(el, {
        type: 'lines', mask: 'lines', autoSplit: true,
        onSplit(self) {
          return gsap.from(self.lines, {
            yPercent: 110, duration: 1.2, stagger: 0.09, ease: 'expo.out',
            scrollTrigger: { trigger: el, start: 'top 88%', once: true },
          });
        },
      });
    });
  }

  function reveals(root) {
    const els = $$('[data-reveal]', root);
    if (reduced) { gsap.set(els, { opacity: 1 }); return; }
    const clip = els.filter((e) => e.dataset.reveal === 'clip');
    const up = els.filter((e) => e.dataset.reveal !== 'clip');
    gsap.set(up, { y: 48, opacity: 0, filter: 'blur(6px)' });
    ScrollTrigger.batch(up, {
      start: 'top 90%', once: true,
      onEnter: (batch) => gsap.to(batch, { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.1, stagger: 0.09, clearProps: 'filter' }),
    });
    clip.forEach((el) => {
      gsap.set(el, { opacity: 1, clipPath: 'inset(12% 8% 12% 8% round 4px)' });
      const inner = el.querySelector('img');
      if (inner) gsap.set(inner, { scale: 1.18 });
      ScrollTrigger.create({
        trigger: el, start: 'top 88%', once: true,
        onEnter: () => {
          gsap.to(el, { clipPath: 'inset(0% 0% 0% 0% round 4px)', duration: 1.5, ease: 'expo.out', clearProps: 'clipPath' });
          if (inner) gsap.to(inner, { scale: 1, duration: 1.8, ease: 'expo.out', clearProps: 'transform' });
        },
      });
    });
  }

  function magnetic(root) {
    if (!finePointer || reduced) return;
    $$('[data-magnetic]', root).forEach((el) => {
      const xTo = gsap.quickTo(el, 'x', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      const yTo = gsap.quickTo(el, 'y', { duration: 0.6, ease: 'elastic.out(1, 0.4)' });
      el.addEventListener('pointermove', (e) => {
        const r = el.getBoundingClientRect();
        xTo((e.clientX - (r.left + r.width / 2)) * 0.22);
        yTo((e.clientY - (r.top + r.height / 2)) * 0.3);
      });
      el.addEventListener('pointerleave', () => { xTo(0); yTo(0); });
    });
  }

  function accordions(root) {
    $$('.acc__btn', root).forEach((b) => {
      b.addEventListener('click', () => {
        const panel = document.getElementById(b.getAttribute('aria-controls'));
        const open = b.getAttribute('aria-expanded') === 'true';
        b.setAttribute('aria-expanded', String(!open));
        gsap.to(panel, { height: open ? 0 : 'auto', duration: reduced ? 0 : 0.7, ease: 'expo.out', onComplete: () => ScrollTrigger.refresh() });
      });
    });
  }

  /* =====================================================================
     PAGE CONTROLLERS (interactions + choreography)
     ===================================================================== */
  const Controllers = {};

  Controllers.home = (root, { intro }) => {
    // Hero: headline entrance + arch showcase that cycles through products
    const title = $('#heroTitle', root);
    const show = $('#hshow', root);
    const slides = $$('.hshow__slide', show);
    const bars = $$('.hshow__bars button', show);
    const fills = bars.map((b) => b.querySelector('i'));
    const heroProducts = HERO_SLIDES.map((s) => anyProduct(s.handle));
    const DWELL = 5.5;
    let cur = 0;
    let progress = null;
    let hovering = false;
    let heroVisible = true;
    let alive = true;
    cleanups.push(() => { alive = false; progress?.kill(); });

    const swapText = (el, text) => {
      if (el.textContent === text) return;
      if (reduced) { el.textContent = text; return; }
      gsap.timeline()
        .to(el, { yPercent: -110, duration: 0.4, ease: 'power3.in' })
        .add(() => { el.textContent = text; })
        .fromTo(el, { yPercent: 110 }, { yPercent: 0, duration: 0.9, ease: 'expo.out' });
    };
    const setFills = () => fills.forEach((f, i) => gsap.set(f, { scaleX: i < cur ? 1 : 0 }));
    const startProgress = () => {
      progress?.kill();
      if (reduced || !alive) return;
      progress = gsap.fromTo(fills[cur], { scaleX: 0 }, { scaleX: 1, duration: DWELL, ease: 'none', onComplete: () => go((cur + 1) % slides.length) });
      if (hovering || !heroVisible) progress.pause();
    };
    function go(n) {
      if (!alive) return;
      if (n === cur) { startProgress(); return; }
      const prev = slides[cur];
      const next = slides[n];
      const p = heroProducts[n];
      slides.forEach((s, i) => {
        s.setAttribute('aria-hidden', String(i !== n));
        gsap.set(s, { zIndex: i === n ? 2 : i === cur ? 1 : 0 });
      });
      bars.forEach((b, i) => b.setAttribute('aria-selected', String(i === n)));
      if (reduced) {
        gsap.set(next, { clipPath: 'inset(0% 0% 0% 0%)' });
        gsap.set(prev, { clipPath: 'inset(100% 0% 0% 0%)' });
      } else {
        gsap.fromTo(next, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.35, ease: 'tidelyInOut', overwrite: true });
        gsap.fromTo(next.querySelector('img'), { scale: 1.3, yPercent: 7 }, { scale: 1, yPercent: 0, duration: 2.4, ease: 'expo.out', overwrite: true });
        gsap.to(prev.querySelector('img'), {
          scale: 1.12, yPercent: -7, duration: 1.35, ease: 'tidelyInOut', overwrite: true,
          onComplete: () => { if (slides.indexOf(prev) !== cur) gsap.set(prev, { clipPath: 'inset(100% 0% 0% 0%)' }); },
        });
      }
      const cat = collectionOf(p.collection).title;
      swapText($('#hCat', show), cat);
      swapText($('#hName', show), p.title);
      swapText($('#hPrice', show), byHandle(HERO_SLIDES[n].handle) ? fromPrice(p) : 'View collection');
      $('#hCard', show).setAttribute('href', link(plink(HERO_SLIDES[n].handle)));
      cur = n;
      setFills();
      startProgress();
    }
    gsap.set(slides[0], { clipPath: 'inset(0% 0% 0% 0%)', zIndex: 2 });
    bars.forEach((b) => b.addEventListener('click', () => go(+b.dataset.go)));
    show.addEventListener('pointerenter', () => { hovering = true; progress?.pause(); });
    show.addEventListener('pointerleave', () => { hovering = false; if (heroVisible) progress?.resume(); });
    show.addEventListener('focusin', () => { hovering = true; progress?.pause(); });
    show.addEventListener('focusout', () => { hovering = false; if (heroVisible) progress?.resume(); });
    ScrollTrigger.create({
      trigger: '.hero', start: 'top top', end: 'bottom top',
      onToggle: (self) => { heroVisible = self.isActive; if (!heroVisible) progress?.pause(); else if (!hovering) progress?.resume(); },
    });

    const heroTl = gsap.timeline({ paused: true, defaults: { ease: 'expo.out' } });
    if (!reduced) {
      const split = SplitText.create(title, { type: 'lines,words', mask: 'lines' });
      heroTl.from(split.lines, { yPercent: 115, duration: 1.4, stagger: 0.12 })
        .from($$('[data-hero-fade]', root), { y: 30, opacity: 0, duration: 1.2, stagger: 0.12 }, '-=1')
        .from('.hshow__arch', { clipPath: 'inset(100% 0% 0% 0%)', duration: 1.6, ease: 'expo.inOut', clearProps: 'clipPath' }, 0)
        .from(slides[0].querySelector('img'), { scale: 1.35, duration: 2.4 }, 0.1)
        .from('.hshow__ring', { opacity: 0, scale: 0.94, duration: 1.6 }, 0.45)
        .from('.hshow__card', { x: -40, opacity: 0, duration: 1.2 }, 0.9)
        .from('.hshow__bars', { opacity: 0, y: 10, duration: 1 }, 1.1)
        .add(() => startProgress());
      intro.then(() => heroTl.play());

      // Scroll depth: the arch, ring, ghost word and card drift at different speeds
      const scrub = { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true };
      gsap.to('.hshow__arch', { yPercent: -6, ease: 'none', scrollTrigger: { ...scrub } });
      gsap.to('.hshow__card', { yPercent: -60, ease: 'none', scrollTrigger: { ...scrub } });
      gsap.to('.hero__copy', { yPercent: -18, opacity: 0.2, ease: 'none', scrollTrigger: { ...scrub } });

      // Pointer depth
      if (finePointer) {
        const ringX = gsap.quickTo('.hshow__ring', 'x', { duration: 1.2, ease: 'power3.out' });
        const ringY = gsap.quickTo('.hshow__ring', 'y', { duration: 1.2, ease: 'power3.out' });
        const onMove = (e) => {
          const nx = e.clientX / innerWidth - 0.5; const ny = e.clientY / innerHeight - 0.5;
          ringX(nx * -22); ringY(ny * -16);
        };
        window.addEventListener('pointermove', onMove);
        cleanups.push(() => window.removeEventListener('pointermove', onMove));
      }
    }

    // Service bar: hairlines draw across, then each promise rises in turn
    const serviceBar = $('#service', root);
    if (reduced) serviceBar.classList.add('is-in');
    else {
      gsap.set($$('.service__item', serviceBar), { y: 24, opacity: 0 });
      gsap.set($$('.service__icon', serviceBar), { scale: 0.5, rotate: -40 });
      ScrollTrigger.create({
        trigger: serviceBar, start: 'top 92%', once: true,
        onEnter: () => {
          serviceBar.classList.add('is-in');
          gsap.to($$('.service__item', serviceBar), { y: 0, opacity: 1, duration: 1.1, stagger: 0.1, delay: 0.25, ease: 'expo.out' });
          gsap.to($$('.service__icon', serviceBar), { scale: 1, rotate: 0, duration: 1.2, stagger: 0.1, delay: 0.3, ease: 'back.out(1.8)' });
        },
      });
    }

    // Shop by space: accordion panels. Hover or focus opens a panel; the rest fold into columns.
    const spaces = $('#spaces', root);
    const panels = $$('.space', spaces);
    const openPanel = (el) => panels.forEach((p) => p.classList.toggle('is-open', p === el));
    panels.forEach((p) => {
      p.addEventListener('pointerenter', () => openPanel(p));
      p.addEventListener('focusin', () => openPanel(p));
    });
    if (!reduced) {
      gsap.set(panels, { clipPath: 'inset(100% 0% 0% 0%)' });
      gsap.set($$('.space__count, .space__title', spaces), { yPercent: 120 });
      ScrollTrigger.create({
        trigger: spaces, start: 'top 82%', once: true,
        onEnter: () => {
          gsap.to(panels, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, stagger: 0.12, ease: 'tidelyInOut', clearProps: 'clipPath' });
          gsap.fromTo($$('img', spaces), { scale: 1.35 }, { scale: 1, duration: 2.2, stagger: 0.12, ease: 'expo.out', clearProps: 'transform' });
          gsap.to($$('.space__count, .space__title', spaces), { yPercent: 0, duration: 1.2, stagger: 0.06, delay: 0.55, ease: 'expo.out' });
        },
      });
    }

    // Horizontal collection (desktop pin, mobile native scroll)
    const mm = gsap.matchMedia();
    mm.add('(min-width: 768px) and (prefers-reduced-motion: no-preference)', () => {
      const tr = $('#hTrack', root);
      const distance = () => tr.scrollWidth - innerWidth;
      const tween = gsap.to(tr, {
        x: () => -distance(), ease: 'none',
        scrollTrigger: {
          trigger: '#collection', start: 'top top', end: () => `+=${distance()}`, pin: '.hscroll__pin', scrub: 1, invalidateOnRefresh: true,
          onUpdate: (self) => gsap.set('#hProgress', { scaleX: self.progress }),
        },
      });
      $$('.pcard__media img', tr).forEach((im) => {
        gsap.fromTo(im, { xPercent: -6 }, { xPercent: 6, ease: 'none', scrollTrigger: { trigger: im.closest('.pcard'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true } });
      });
      return () => gsap.set(tr, { clearProps: 'x' });
    });
    matchMedias.push(mm);

    // Snack organizer anatomy: a spotlight glides between hotspots, the matching feature opens
    const stage = $('#anatomy', root);
    const spot = $('.anatomy__spot', stage);
    const hotspots = $$('.hotspot', stage);
    const features = $$('.feature', root);
    let active = 0;
    let auto = null;
    let userTook = false;
    const place = (i, instant) => {
      const a = ANATOMY[i];
      gsap.to(spot, { '--x': `${a.x}%`, '--y': `${a.y}%`, duration: instant || reduced ? 0 : 1.1, ease: 'tidelyInOut', overwrite: true });
    };
    const setActive = (i, instant = false) => {
      active = i;
      hotspots.forEach((h, k) => { h.classList.toggle('is-active', k === i); h.setAttribute('aria-pressed', String(k === i)); });
      features.forEach((f, k) => { f.classList.toggle('is-active', k === i); f.querySelector('.feature__btn').setAttribute('aria-expanded', String(k === i)); });
      place(i, instant);
    };
    const stopAuto = () => { userTook = true; auto?.kill(); auto = null; };
    const runAuto = () => {
      if (reduced || userTook || !alive || auto) return;
      auto = gsap.delayedCall(4.2, () => { auto = null; setActive((active + 1) % ANATOMY.length); runAuto(); });
    };
    cleanups.push(() => auto?.kill());
    $$('[data-spot]', root).forEach((b) => b.addEventListener('click', () => { stopAuto(); setActive(+b.dataset.spot); }));
    setActive(0, true);
    if (!reduced) {
      gsap.set(hotspots, { scale: 0, opacity: 0 });
      gsap.set(spot, { opacity: 0 });
      ScrollTrigger.create({
        trigger: stage, start: 'top 70%', end: 'bottom 20%',
        onEnter: () => {
          if (stage.dataset.shown) { auto?.resume(); return; }
          stage.dataset.shown = '1';
          gsap.to(hotspots, { scale: 1, opacity: 1, duration: 0.8, stagger: 0.1, delay: 0.6, ease: 'back.out(2)' });
          gsap.to(spot, { opacity: 1, duration: 1, delay: 0.9, onComplete: runAuto });
        },
        onLeave: () => { auto?.pause(); },
        onEnterBack: () => { if (auto) auto.resume(); },
        once: false,
      });
    }

    // Statement: words light up as you read
    const st = $('#statement', root);
    const words = [];
    const wrapWords = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((t) => {
            if (!t) return;
            if (/^\s+$/.test(t)) frag.appendChild(document.createTextNode(t));
            else { const s = document.createElement('span'); s.className = 'word'; s.textContent = t; frag.appendChild(s); words.push(s); }
          });
          n.replaceWith(frag);
        } else wrapWords(n);
      });
    };
    wrapWords(st);
    if (!reduced) gsap.to(words, { opacity: 1, stagger: 0.1, ease: 'none', scrollTrigger: { trigger: st, start: 'top 80%', end: 'bottom 45%', scrub: true } });

    // Sticky stack: each card recedes as the next arrives
    if (!reduced) {
      const cards = $$('.stack__card', root);
      cards.forEach((card, i) => {
        if (i === cards.length - 1) return;
        const st = { trigger: cards[i + 1], start: 'top bottom', end: 'top top', scrub: true };
        gsap.to(card.querySelector('.stack__inner'), { scale: 0.92, ease: 'none', scrollTrigger: st });
        gsap.to(card.querySelector('.stack__shade'), { opacity: 0.65, ease: 'none', scrollTrigger: { ...st } });
      });
      cards.forEach((card) => gsap.from(card.querySelector('.stack__media img'), { scale: 1.2, ease: 'none', scrollTrigger: { trigger: card, start: 'top bottom', end: 'top top', scrub: true } }));
    }

    // Before / after
    const cmp = $('#compare', root);
    const range = $('.compare__range', cmp);
    const setPos = (v) => { cmp.style.setProperty('--pos', `${v}%`); range.value = v; };
    range.addEventListener('input', () => setPos(range.value));
    if (!reduced) {
      const demo = { v: 50 };
      ScrollTrigger.create({
        trigger: cmp, start: 'top 60%', once: true,
        onEnter: () => gsap.timeline({ delay: 0.4 })
          .to(demo, { v: 12, duration: 1.1, ease: 'power3.inOut', onUpdate: () => setPos(demo.v) })
          .to(demo, { v: 86, duration: 1.4, ease: 'power3.inOut', onUpdate: () => setPos(demo.v) })
          .to(demo, { v: 50, duration: 1, ease: 'power3.inOut', onUpdate: () => setPos(demo.v) }),
      });
    }

    // Newsletter
    const form = $('#newsForm', root);
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = $('#newsEmail', form); const help = $('#newsHelp', form); const b = $('button', form);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim())) { help.textContent = 'Please enter a valid email address.'; help.classList.add('is-error'); input.focus(); return; }
      help.classList.remove('is-error'); b.disabled = true; $('span', b).textContent = 'Joining';
      if (SHOP) { HTMLFormElement.prototype.submit.call(form); return; }
      setTimeout(() => { b.disabled = false; $('span', b).textContent = 'Subscribed'; help.textContent = 'Welcome to Tidely. Your code is on its way to your inbox.'; input.value = ''; }, 800);
    });
    if (new URLSearchParams(location.search).get('customer_posted') === 'true') {
      $('#newsHelp', form).textContent = 'Welcome to Tidely. You are on the list.';
    }
  };

  // Shop: "Featured" groups products by collection (Care, Organize, Pet Home, Travel), 9 per page.
  const PER_PAGE = 9;
  const collectionRank = (p) => { const i = COLLECTIONS.findIndex((c) => c.handle === p.collection); return i < 0 ? COLLECTIONS.length : i; };
  Controllers.shop = (root, { params, query }) => {
    const grid = $('#grid', root);
    const empty = $('#empty', root);
    const pager = $('#pager', root);
    const sortSel = $('#sort', root);
    let filter = params.collection && collectionOf(params.collection) ? params.collection : 'all';
    let page = Math.max(1, parseInt(query?.get('page'), 10) || 1);
    const listFor = () => {
      const list = PRODUCTS.filter((p) => filter === 'all' || p.collection === filter);
      if (sortSel.value === 'price-asc') return list.sort((a, b) => a.price - b.price);
      if (sortSel.value === 'price-desc') return list.sort((a, b) => b.price - a.price);
      return list.sort((a, b) => collectionRank(a) - collectionRank(b)); // stable: keeps the featured order inside each collection
    };
    const syncUrl = () => setUrl(`${filter === 'all' ? '#/shop' : `#/shop/${filter}`}${page > 1 ? `?page=${page}` : ''}`);
    const drawPager = (total, pages) => {
      pager.hidden = pages < 2;
      if (pages < 2) { pager.innerHTML = ''; return; }
      const from = (page - 1) * PER_PAGE + 1;
      const to = Math.min(page * PER_PAGE, total);
      pager.innerHTML = `
        <button class="pager__arrow pager__arrow--prev" data-page="${page - 1}"${page === 1 ? ' disabled' : ''} aria-label="Previous page">${ic('arrow')}</button>
        <ol class="pager__list">${Array.from({ length: pages }, (_, i) => i + 1).map((n) => `<li><button class="pager__num${n === page ? ' is-active' : ''}" data-page="${n}"${n === page ? ' aria-current="page"' : ''} aria-label="Page ${n}">${n}</button></li>`).join('')}</ol>
        <button class="pager__arrow" data-page="${page + 1}"${page === pages ? ' disabled' : ''} aria-label="Next page">${ic('arrow')}</button>
        <p class="pager__count">${from} to ${to} of ${total} products</p>`;
    };
    const render = (mode) => {
      const list = listFor();
      const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
      page = Math.min(page, pages);
      const shown = list.slice((page - 1) * PER_PAGE, page * PER_PAGE);
      const state = mode === 'flip' && !reduced ? Flip.getState($$('.pcard', grid)) : null;
      grid.innerHTML = shown.map((p) => productCard(p)).join('');
      fixLinks(grid);
      empty.hidden = list.length > 0;
      drawPager(list.length, pages);
      if (state) {
        Flip.from(state, {
          targets: $$('.pcard', grid), duration: 0.9, ease: 'expo.inOut', absolute: true, scale: true,
          onEnter: (els) => gsap.fromTo(els, { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.9, delay: 0.2 }),
          onLeave: (els) => gsap.to(els, { opacity: 0, scale: 0.9, duration: 0.5 }),
          onComplete: () => ScrollTrigger.refresh(),
        });
      } else if (!reduced) {
        gsap.from($$('.pcard', grid), { y: 60, opacity: 0, duration: 1.2, stagger: 0.06, ease: 'expo.out', delay: mode === 'page' ? 0 : 0.2, onComplete: () => ScrollTrigger.refresh() });
      } else {
        ScrollTrigger.refresh();
      }
    };
    const goToPage = (n) => {
      if (n === page || n < 1) return;
      page = n;
      syncUrl();
      scrollTo($('.toolbar', root), { offset: -140, duration: 1 });
      const cards = $$('.pcard', grid);
      if (reduced || !cards.length) { render('page'); return; }
      gsap.to(cards, { opacity: 0, y: -24, duration: 0.35, stagger: 0.02, ease: 'power2.in', onComplete: () => render('page') });
    };
    const setFilter = (f) => {
      filter = f;
      page = 1;
      $$('.chip', root).forEach((c) => c.classList.toggle('is-active', c.dataset.filter === f));
      const c = collectionOf(f);
      $('#shopTitle', root).textContent = c ? c.title : 'Shop all';
      $('#shopBlurb', root).textContent = c ? c.blurb : ALL_BLURB;
      syncUrl();
      document.title = `${c ? c.title : 'Shop all'} | Tidely`;
      render('flip');
    };
    $$('[data-filter]', root).forEach((b) => b.addEventListener('click', () => setFilter(b.dataset.filter)));
    sortSel.addEventListener('change', () => { page = 1; syncUrl(); render('flip'); });
    pager.addEventListener('click', (e) => { const b = e.target.closest('[data-page]'); if (b && !b.disabled) goToPage(Number(b.dataset.page)); });
    render('first');
  };

  Controllers.product = (root) => {
    const pdp = $('.pdp', root);
    if (!pdp) return;
    const p = byHandle(pdp.dataset.handle);
    const main = $('#galleryMain', root);
    const thumbs = $$('.gallery__thumb', root);
    let idx = thumbs.findIndex((t) => t.classList.contains('is-active'));
    let option = p.options ? ($('[data-opt][aria-pressed="true"]', root)?.dataset.opt || p.options.values[0].value) : null;
    let qty = 1;

    const show = (i) => {
      idx = (i + p.images.length) % p.images.length;
      thumbs.forEach((t, k) => { t.classList.toggle('is-active', k === idx); t.setAttribute('aria-selected', String(k === idx)); });
      const old = $('img', main);
      const next = document.createElement('div');
      next.innerHTML = img(p.images[idx], `${p.title}, image ${idx + 1}`, { sizes: '(max-width: 900px) 100vw, 55vw', eager: true });
      const im = next.firstElementChild;
      main.insertBefore(im, $('.gallery__nav', main));
      main.classList.remove('is-zoom');
      if (reduced) { old.remove(); return; }
      gsap.fromTo(im, { opacity: 0, scale: 1.06 }, { opacity: 1, scale: 1, duration: 0.9, ease: 'expo.out', onComplete: () => old.remove() });
    };
    thumbs.forEach((t) => t.addEventListener('click', () => show(+t.dataset.idx)));
    $('#gPrev', root).addEventListener('click', (e) => { e.stopPropagation(); show(idx - 1); });
    $('#gNext', root).addEventListener('click', (e) => { e.stopPropagation(); show(idx + 1); });
    main.addEventListener('click', (e) => {
      if (e.target.closest('.gallery__nav')) return;
      const r = main.getBoundingClientRect();
      $('img', main).style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
      main.classList.toggle('is-zoom');
    });
    main.addEventListener('pointermove', (e) => {
      if (!main.classList.contains('is-zoom')) return;
      const r = main.getBoundingClientRect();
      $('img', main).style.transformOrigin = `${((e.clientX - r.left) / r.width) * 100}% ${((e.clientY - r.top) / r.height) * 100}%`;
    });
    main.addEventListener('pointerleave', () => main.classList.remove('is-zoom'));
    const onKey = (e) => { if (e.key === 'ArrowRight' && document.activeElement?.closest('.gallery')) show(idx + 1); if (e.key === 'ArrowLeft' && document.activeElement?.closest('.gallery')) show(idx - 1); };
    window.addEventListener('keydown', onKey);
    cleanups.push(() => window.removeEventListener('keydown', onKey));

    const syncStock = () => {
      const out = variantOf(p, option)?.available === false;
      ['#addBtn', '#stickyAdd'].forEach((sel) => { const b = $(sel, root); b.disabled = out; $('span', b).textContent = out ? 'Sold out' : 'Add to bag'; });
    };
    const updatePrice = () => {
      const { price, compareAt } = priceOf(p, option);
      $('#pPrice', root).innerHTML = `${compareAt ? `<s>${money(compareAt)}</s>` : ''}<span>${money(price)}</span>${compareAt ? `<span class="save">Save ${Math.round((1 - price / compareAt) * 100)}%</span>` : ''}`;
      $('#stickyPrice', root).textContent = money(price * qty);
    };
    $$('[data-opt]', root).forEach((b) => b.addEventListener('click', () => {
      option = b.dataset.opt;
      $$('[data-opt]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      $('#optName', root).textContent = option;
      const v = variantOf(p, option);
      if (v?.image) { const i = p.images.indexOf(v.image); if (i >= 0 && i !== idx) show(i); }
      setUrl(`#/product/${p.handle}?${p.options.type === 'colour' ? 'colour' : 'size'}=${encodeURIComponent(option)}`);
      updatePrice();
      syncStock();
    }));
    $$('[data-q]', root).forEach((b) => b.addEventListener('click', () => { qty = Math.max(1, Math.min(20, qty + +b.dataset.q)); $('#qty', root).textContent = qty; updatePrice(); }));
    const add = () => addToCart(p.handle, option, qty, $('img', main));
    $('#addBtn', root).addEventListener('click', add);
    $('#stickyAdd', root).addEventListener('click', add);

    const bar = $('#stickyBuy', root);
    ScrollTrigger.create({
      trigger: $('#buy', root), start: 'bottom top+=80', endTrigger: document.getElementById('footer'), end: 'top bottom',
      onToggle: (self) => { bar.classList.toggle('is-visible', self.isActive); bar.setAttribute('aria-hidden', String(!self.isActive)); $('#stickyAdd', root).tabIndex = self.isActive ? 0 : -1; },
    });
    updatePrice();
    syncStock();
  };

  Controllers.faq = (root) => {
    $$('[data-scroll]', root).forEach((b) => b.addEventListener('click', () => scrollTo(b.dataset.scroll, { offset: -120 })));
  };

  Controllers.contact = (root) => {
    const form = $('#contactForm', root);
    if (new URLSearchParams(location.search).get('contact_posted') === 'true') {
      form.innerHTML = '<div style="display:grid;gap:1rem;padding:1rem 0"><h2 class="h-lg" style="color:var(--ink)">Thank you.</h2><p style="color:var(--ink-muted)">Your message is on its way. We will reply to the email you gave us.</p></div>';
    }
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      let ok = true;
      $$('.field', form).forEach((f) => {
        const input = $('input, textarea', f); const small = $('small', f);
        if (!input.required) return;
        const valid = input.type === 'email' ? /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value.trim()) : input.value.trim().length > 1;
        small.textContent = valid ? '' : (input.type === 'email' ? 'Please enter a valid email address.' : 'This field is required.');
        small.classList.toggle('is-error', !valid);
        input.setAttribute('aria-invalid', String(!valid));
        if (!valid && ok) { input.focus(); ok = false; }
      });
      if (!ok) return;
      if (SHOP) { HTMLFormElement.prototype.submit.call(form); return; }
      const name = esc($('#cName', form).value.trim().split(' ')[0]);
      gsap.to(form, { opacity: 0, y: 20, duration: reduced ? 0 : 0.4, onComplete: () => {
        form.innerHTML = `<div style="display:grid;gap:1rem;padding:1rem 0"><h2 class="h-lg" style="color:var(--ink)">Thank you, ${name}.</h2><p style="color:var(--ink-muted)">Your message is on its way. We will reply to the email you gave us.</p></div>`;
        gsap.to(form, { opacity: 1, y: 0, duration: reduced ? 0 : 0.8 });
      } });
    });
  };

  /* =====================================================================
     GLOBAL UI
     ===================================================================== */
  // Announcement rotator
  (() => {
    const items = $$('#announce p');
    let i = 0;
    if (reduced || items.length < 2) return;
    setInterval(() => {
      const cur = items[i]; i = (i + 1) % items.length; const nxt = items[i];
      cur.classList.remove('is-active'); cur.classList.add('is-leaving');
      nxt.classList.remove('is-leaving'); nxt.classList.add('is-active');
      setTimeout(() => cur.classList.remove('is-leaving'), 900);
    }, 4200);
  })();

  // Header: floats away on scroll down, returns on scroll up
  const header = $('#header');
  ScrollTrigger.create({
    start: 0, end: 'max',
    onUpdate: (self) => {
      const y = self.scroll();
      header.classList.toggle('is-scrolled', y > 40);
      const hide = y > 400 && self.direction === 1 && $('#mega').hidden && $('#menu').hidden;
      header.classList.toggle('is-hidden', hide);
    },
  });

  // Mega menu
  const megaBtn = $('.nav__mega-btn');
  const mega = $('#mega');
  $('#megaInner').innerHTML = COLLECTIONS.map((c) => `<a class="mega__card" href="#/shop/${c.handle}" data-link>${img(c.image, `${c.title} collection`, { sizes: '22vw' })}<span>${c.title}</span></a>`).join('');
  fixLinks($('#megaInner'));
  const setMega = (open) => {
    megaBtn.setAttribute('aria-expanded', String(open));
    if (open) {
      mega.hidden = false;
      if (!reduced) gsap.fromTo('.mega__card', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.8, stagger: 0.06, ease: 'expo.out' });
    } else mega.hidden = true;
  };
  megaBtn.addEventListener('click', (e) => { e.stopPropagation(); setMega(mega.hidden); });
  document.addEventListener('click', (e) => { if (!mega.hidden && !e.target.closest('#mega')) setMega(false); });

  // Mobile menu
  const burger = $('#burger');
  const menu = $('#menu');
  const setMenu = (open) => {
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    lockScroll(open);
    if (open) {
      menu.hidden = false;
      if (!reduced) {
        gsap.fromTo(menu, { clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)', duration: 0.9, ease: 'expo.inOut' });
        gsap.fromTo('.menu__nav a', { yPercent: 100, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.9, stagger: 0.05, delay: 0.3, ease: 'expo.out' });
      }
    } else if (!reduced) {
      gsap.to(menu, { clipPath: 'inset(0 0 100% 0)', duration: 0.7, ease: 'expo.inOut', onComplete: () => { menu.hidden = true; } });
    } else menu.hidden = true;
  };
  burger.addEventListener('click', () => setMenu(menu.hidden));

  // Cart drawer
  const drawer = $('#drawer');
  const scrim = $('#scrim');
  let lastFocus = null;
  function openDrawer() {
    if (drawer.classList.contains('is-open')) return;
    lastFocus = document.activeElement;
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    scrim.hidden = false;
    lockScroll(true);
    gsap.set(drawer, { visibility: 'visible' });
    gsap.to(scrim, { opacity: 1, duration: reduced ? 0 : 0.5 });
    gsap.to(drawer, { xPercent: 0, duration: reduced ? 0 : 0.9, ease: 'expo.out' });
    if (!reduced) gsap.from('#drawerBody > *', { x: 40, opacity: 0, duration: 0.8, stagger: 0.06, delay: 0.2, ease: 'expo.out' });
    setTimeout(() => $('#drawerClose').focus(), 50);
  }
  function closeDrawer() {
    if (!drawer.classList.contains('is-open')) return;
    drawer.classList.remove('is-open');
    drawer.setAttribute('aria-hidden', 'true');
    gsap.to(scrim, { opacity: 0, duration: reduced ? 0 : 0.4, onComplete: () => { scrim.hidden = true; } });
    gsap.to(drawer, { xPercent: 100, duration: reduced ? 0 : 0.7, ease: 'expo.inOut', onComplete: () => gsap.set(drawer, { visibility: 'hidden' }) });
    lockScroll(false);
    lastFocus?.focus?.();
  }
  $('#cartBtn').addEventListener('click', openDrawer);
  $('#drawerClose').addEventListener('click', closeDrawer);
  scrim.addEventListener('click', closeDrawer);

  function bumpCount() {
    const c = $('#cartCount');
    if (!reduced) gsap.fromTo(c, { scale: 1.6 }, { scale: 1, duration: 0.8, ease: 'elastic.out(1, 0.4)', clearProps: 'transform' });
  }
  function flyToCart(fromEl, done) {
    const r = fromEl.getBoundingClientRect();
    const target = $('#cartBtn').getBoundingClientRect();
    const clone = document.createElement('img');
    clone.src = fromEl.currentSrc || fromEl.src;
    clone.className = 'fly';
    const size = Math.min(r.width, 220);
    Object.assign(clone.style, { width: `${size}px`, height: `${size}px`, left: `${r.left + r.width / 2 - size / 2}px`, top: `${r.top + r.height / 2 - size / 2}px` });
    document.body.appendChild(clone);
    const dx = target.left + target.width / 2 - (r.left + r.width / 2);
    const dy = target.top + target.height / 2 - (r.top + r.height / 2);
    gsap.timeline({ onComplete: () => { clone.remove(); bumpCount(); done(); } })
      .to(clone, { scale: 0.85, duration: 0.25, ease: 'power2.out' })
      .to(clone, { x: dx, duration: 0.85, ease: 'power3.inOut' }, 0.15)
      .to(clone, { y: dy, duration: 0.85, ease: 'back.in(1.4)' }, 0.15)
      .to(clone, { scale: 0.08, borderRadius: '50%', opacity: 0.6, duration: 0.85, ease: 'power3.in' }, 0.15);
  }

  function renderCart() {
    const count = itemCount();
    const cc = $('#cartCount');
    cc.textContent = count;
    cc.classList.toggle('has-items', count > 0);
    $('#cartBtn').setAttribute('aria-label', `Open bag, ${count} ${count === 1 ? 'item' : 'items'}`);
    const sub = subtotal();
    const left = Math.max(0, CONFIG.freeShippingFrom - sub);
    $('#drawerShip').innerHTML = count ? `
      <p>${left > 0 ? `You are <b>${money(left)}</b> away from free shipping.` : '<b>Your order ships free.</b>'}</p>
      <div class="ship-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${CONFIG.freeShippingFrom}" aria-valuenow="${Math.min(sub, CONFIG.freeShippingFrom).toFixed(2)}" aria-label="Progress to free shipping"><span style="transform:scaleX(${Math.min(1, sub / CONFIG.freeShippingFrom)})"></span></div>` : '';
    $('#drawerShip').hidden = !count;
    const body = $('#drawerBody');
    if (!count) {
      body.innerHTML = `<div class="drawer-empty">${ic('bag')}<h3>Your bag is empty</h3><p>Everything has a place. Let us find yours.</p><a class="btn btn--dark" href="#/shop" data-link><span>Shop the collection</span><span class="btn__dot">${ic('arrow')}</span></a></div>`;
      $('#drawerFoot').innerHTML = '';
      fixLinks(body);
      return;
    }
    body.innerHTML = cart.map((l) => {
      const p = byHandle(l.handle) || { title: l.title || l.handle, card: l.image || '', options: null };
      const v = p.options ? variantOf(p, l.option) : null;
      const pic = v?.image && v.image.startsWith('crop-') ? v.image : p.card;
      return `<div class="line">
        <img src="${srcSm(pic)}" alt="${esc(p.title)}">
        <div>
          <p class="line__t">${esc(p.title)}</p>
          ${l.option ? `<p class="line__v">${esc(p.options?.name || 'Option')}: ${esc(p.options?.values.find((val) => val.value === l.option || variantMatches(val, { options: [l.option] }))?.value || l.option)}</p>` : ''}
          <div class="qty" role="group" aria-label="Quantity for ${esc(p.title)}"><button data-line="${esc(l.key)}" data-d="-1" aria-label="Decrease">${ic('minus')}</button><output>${l.qty}</output><button data-line="${esc(l.key)}" data-d="1" aria-label="Increase">${ic('plus')}</button></div>
        </div>
        <div class="line__side"><span>${money(lineTotal(l))}</span><button class="line__rm" data-rm="${esc(l.key)}">Remove</button></div>
      </div>`;
    }).join('');
    const upsell = PRODUCTS.filter((p) => !cart.some((l) => l.handle === p.handle)).sort((a, b) => a.price - b.price)[0];
    if (upsell) body.insertAdjacentHTML('beforeend', `<div class="upsell"><img src="${srcSm(upsell.card)}" alt=""><div><b>${esc(upsell.title)}</b><span>${upsell.options?.type === 'size' ? fromPrice(upsell) : `Add for ${money(upsell.price)}`}</span></div><button data-upsell="${upsell.handle}" aria-label="Add ${esc(upsell.title)} to bag">${ic('plus')}</button></div>`);
    const shipping = sub >= CONFIG.freeShippingFrom ? 0 : CONFIG.shippingCost;
    $('#drawerFoot').innerHTML = `
      <div class="drawer__row"><span>Subtotal</span><span>${money(sub)}</span></div>
      <div class="drawer__row"><span>Shipping</span><span>${shipping ? money(shipping) : 'Free'}</span></div>
      <div class="drawer__row total"><span>Total</span><span>${money(sub + shipping)}</span></div>
      <button class="btn btn--dark btn--block" id="checkoutBtn"><span>Checkout</span><span class="btn__dot">${ic('lock')}</span></button>
      <p class="drawer__note">Prices include VAT. Secure checkout.</p>`;
    fixLinks($('#drawer'));
  }
  $('#drawer').addEventListener('click', (e) => {
    const d = e.target.closest('[data-d]');
    if (d) { const l = cart.find((x) => x.key === d.dataset.line); if (l) setQty(l.key, l.qty + +d.dataset.d); return; }
    const rm = e.target.closest('[data-rm]');
    if (rm) { const row = rm.closest('.line'); gsap.to(row, { x: 60, opacity: 0, duration: reduced ? 0 : 0.4, onComplete: () => setQty(rm.dataset.rm, 0) }); return; }
    const up = e.target.closest('[data-upsell]');
    if (up) { addToCart(up.dataset.upsell); toast('Added to your bag'); return; }
    if (e.target.closest('#checkoutBtn')) {
      if (SHOP) { window.location.href = '/checkout'; return; }
      $('#modal').hidden = false; $('#modalClose').focus(); return;
    }
    if (e.target.closest('[data-link]')) closeDrawer();
  });
  $('#modalClose').addEventListener('click', () => { $('#modal').hidden = true; });

  // Quick add (delegated)
  document.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (!q) return;
    e.preventDefault();
    const card = q.closest('.pcard');
    addToCart(q.dataset.quick, null, 1, $('.pcard__media img', card));
  });

  // Search
  const search = $('#search');
  const sInput = $('#searchInput');
  const sResults = $('#searchResults');
  const drawResults = () => {
    const q = sInput.value.trim().toLowerCase();
    if (!q) {
      sResults.innerHTML = `<p class="search__hint">Popular spaces</p>${COLLECTIONS.map((c) => `<a class="sres" href="#/shop/${c.handle}" data-link><img src="${srcSm(c.image)}" alt=""><div><b>${c.title}</b><span>${esc(c.blurb)}</span></div>${ic('arrow')}</a>`).join('')}`;
      fixLinks(sResults);
      return;
    }
    const hits = PRODUCTS.filter((p) => [p.title, p.subtitle, p.collection, p.short, ...p.highlights].join(' ').toLowerCase().includes(q));
    sResults.innerHTML = hits.length
      ? hits.map((p) => `<a class="sres" href="#/product/${p.handle}" data-link><img src="${srcSm(p.card)}" alt=""><div><b>${esc(p.title)}</b><span>${esc(p.subtitle)}</span></div><span class="price">${fromPrice(p)}</span></a>`).join('')
      : `<p class="search__hint">No results for “${esc(sInput.value)}”. Try “bag”, “drawer” or “suede”.</p>`;
    fixLinks(sResults);
    if (!reduced) gsap.from($$('.sres', sResults), { y: 16, opacity: 0, duration: 0.5, stagger: 0.04, ease: 'expo.out' });
  };
  const setSearch = (open) => {
    if (open) {
      lastFocus = document.activeElement;
      search.hidden = false; lockScroll(true); drawResults();
      if (!reduced) gsap.fromTo('.search__panel', { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'expo.out' });
      setTimeout(() => sInput.focus(), 30);
    } else { search.hidden = true; lockScroll(false); lastFocus?.focus?.(); }
  };
  $('#searchBtn').addEventListener('click', () => setSearch(true));
  $('#searchClose').addEventListener('click', () => setSearch(false));
  search.addEventListener('click', (e) => { if (e.target === search) setSearch(false); if (e.target.closest('[data-link]')) setSearch(false); });
  sInput.addEventListener('input', drawResults);

  // Escape closes any layer
  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!$('#modal').hidden) { $('#modal').hidden = true; return; }
    if (!search.hidden) return setSearch(false);
    if (drawer.classList.contains('is-open')) return closeDrawer();
    if (!menu.hidden) return setMenu(false);
    if (!mega.hidden) return setMega(false);
  });

  /* =====================================================================
     ROUTER
     ===================================================================== */
  let pageCtx = null;
  let cleanups = [];
  let matchMedias = [];
  let firstRender = true;
  let resolveIntro;
  const intro = new Promise((r) => { resolveIntro = r; });

  const parse = () => {
    const raw = location.hash.startsWith('#/') ? location.hash.slice(1) : '/';
    const [path, qs] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    const query = new URLSearchParams(qs || '');
    if (!parts.length) return { name: 'home', params: {}, query };
    if (parts[0] === 'shop') return { name: 'shop', params: { collection: parts[1] }, query };
    if (parts[0] === 'product') return { name: 'product', params: { handle: parts[1], query }, query };
    if (['about', 'faq', 'contact'].includes(parts[0])) return { name: parts[0], params: {}, query };
    if (parts[0] === 'policy') return { name: 'policy', params: { id: parts[1] }, query };
    return { name: 'notFound', params: {}, query };
  };
  // Shopify: route from the real URL. null means Shopify renders the page itself.
  const parsePath = () => {
    const parts = location.pathname.split('/').filter(Boolean);
    const query = new URLSearchParams(location.search);
    if (SHOP.template === '404') return { name: 'notFound', params: {}, query };
    if (!parts.length) return { name: 'home', params: {}, query };
    if (parts[0] === 'collections') {
      if (parts[2] === 'products' && parts[3]) return { name: 'product', params: { handle: parts[3], query }, query };
      return { name: 'shop', params: { collection: parts[1] && parts[1] !== 'all' ? parts[1] : undefined }, query };
    }
    if (parts[0] === 'products' && parts[1]) return { name: 'product', params: { handle: parts[1], query }, query };
    if (parts[0] === 'pages' && ['about', 'faq', 'contact'].includes(parts[1])) return { name: parts[1], params: {}, query };
    return null;
  };
  const titles = { home: 'Tidely | Everything in its place', about: 'Our story | Tidely', faq: 'Help | Tidely', contact: 'Contact | Tidely', notFound: 'Page not found | Tidely' };

  function mount(route) {
    // teardown previous page
    cleanups.forEach((fn) => fn()); cleanups = [];
    matchMedias.forEach((m) => m.revert()); matchMedias = [];
    pageCtx?.revert();
    const main = $('#main');
    main.innerHTML = Pages[route.name](route.params);
    main.classList.remove('is-native');
    hydrateIcons(main);
    fixLinks(main);
    // document title
    if (route.name === 'product') { const p = byHandle(route.params.handle); document.title = p ? `${p.title} | Tidely` : titles.notFound; }
    else if (route.name === 'shop') { const c = collectionOf(route.params.collection); document.title = `${c ? c.title : 'Shop all'} | Tidely`; }
    else if (route.name === 'policy') document.title = `${(POLICIES[route.params.id] || {}).title || 'Policy'} | Tidely`;
    else document.title = titles[route.name] || 'Tidely';
    // nav current state
    const current = link(`#/${route.name === 'shop' ? 'shop' : route.name}`);
    $$('.nav__links a').forEach((a) => a.classList.toggle('is-current', a.getAttribute('href') === current));
    pageCtx = gsap.context(() => {
      splitHeadings(main);
      reveals(main);
      magnetic(main);
      accordions(main);
      Controllers[route.name]?.(main, { params: route.params, query: route.query, intro: firstRender ? intro : Promise.resolve() });
    }, main);
    requestAnimationFrame(() => ScrollTrigger.refresh());
  }

  let navBusy = false;
  let navPending = false;
  async function navigate() {
    if (!SHOP && !location.hash.startsWith('#/') && location.hash && !firstRender) return; // in-page anchors (skip link)
    if (SHOP && !parsePath()) {
      if (firstRender) { $('#main').classList.add('is-native'); firstRender = false; resolveIntro(); return; }
      window.location.reload(); // a page only Shopify can render
      return;
    }
    // One transition at a time: a click during a transition queues the latest route.
    if (navBusy) { navPending = true; return; }
    navBusy = true;
    try { await transitionTo(SHOP ? parsePath() : parse()); } finally {
      navBusy = false;
      if (navPending) { navPending = false; navigate(); }
    }
  }

  async function transitionTo(route) {
    setMega(false);
    if (!menu.hidden) setMenu(false);
    if (drawer.classList.contains('is-open')) closeDrawer();
    // Hidden tabs pause requestAnimationFrame, so skip the curtain there.
    if (firstRender || reduced || document.hidden) {
      if (!firstRender) { if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0); }
      mount(route);
      firstRender = false;
      return;
    }
    const curtain = $('#curtain');
    const mark = $('.curtain__mark', curtain);
    await gsap.timeline()
      .set(curtain, { y: 0, yPercent: 100, pointerEvents: 'auto' })
      .to(curtain, { yPercent: 0, duration: 0.7, ease: 'tidelyInOut' })
      .to(mark, { opacity: 1, duration: 0.3 }, '-=0.3');
    if (lenis) lenis.scrollTo(0, { immediate: true }); else window.scrollTo(0, 0);
    mount(route);
    $('#main').focus({ preventScroll: true });
    await gsap.timeline()
      .to(mark, { opacity: 0, duration: 0.2 })
      .to(curtain, { yPercent: -100, duration: 0.8, ease: 'tidelyInOut' })
      .set(curtain, { yPercent: 100, pointerEvents: 'none' });
  }

  // In-page anchors scroll; route links navigate without a full reload
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a) return;
    const href = a.getAttribute('href');
    if (href.startsWith('#') && !href.startsWith('#/')) { e.preventDefault(); const t = href.length > 1 && $(href); if (t) { t.focus?.(); scrollTo(href); } return; }
    if (!SHOP) { if (href === location.hash) { e.preventDefault(); scrollTo(0); } return; }
    const target = href.startsWith('#/') ? toPath(href) : href;
    if (href.startsWith('#/') && target.startsWith('/policies/')) { e.preventDefault(); window.location.href = target; return; }
    if (!a.hasAttribute('data-link') || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank') return;
    const url = new URL(target, location.href);
    if (url.origin !== location.origin) return;
    e.preventDefault();
    if (url.pathname + url.search === location.pathname + location.search) { scrollTo(0); return; }
    history.pushState(null, '', url.pathname + url.search);
    navigate();
  });
  window.addEventListener(SHOP ? 'popstate' : 'hashchange', navigate);

  /* =====================================================================
     BOOT
     ===================================================================== */
  function footerAnimation() {
    if (reduced) return;
    gsap.from('#footerWord span', { yPercent: 100, duration: 1.4, stagger: 0.07, ease: 'expo.out', scrollTrigger: { trigger: '#footerWord', start: 'top 95%', toggleActions: 'play none none reverse' } });
  }

  function runIntro() {
    const pre = $('#preloader');
    let seen = false;
    try { seen = !!sessionStorage.getItem('tidely-intro'); } catch (e) { /* ignore */ }
    if (reduced || seen || document.documentElement.classList.contains('no-intro')) { pre.remove(); resolveIntro(); return; }
    try { sessionStorage.setItem('tidely-intro', '1'); } catch (e) { /* ignore */ }
    lockScroll(true);
    const letters = $$('.preloader__word span', pre);
    gsap.timeline({ onComplete: () => { pre.remove(); lockScroll(false); } })
      .from(letters, { yPercent: 120, duration: 1.1, stagger: 0.07, ease: 'expo.out' })
      .to('.preloader__rule', { scaleX: 1, duration: 1.1, ease: 'expo.inOut' }, 0.3)
      .from('.preloader__tag', { opacity: 0, y: 10, duration: 0.8 }, 0.7)
      .to(letters, { yPercent: -120, duration: 0.8, stagger: 0.04, ease: 'expo.in' }, '+=0.35')
      .to(['.preloader__rule', '.preloader__tag'], { opacity: 0, duration: 0.4 }, '<')
      .to(pre, { clipPath: 'inset(0 0 100% 0)', duration: 1.1, ease: 'expo.inOut' }, '-=0.25')
      .add(() => resolveIntro(), '-=0.7');
  }

  async function boot() {
    hydrateIcons(document);
    gsap.set('#drawer', { x: 0, xPercent: 100 });
    gsap.set('#curtain', { y: 0, yPercent: 100 });
    renderFooter();
    hydrateIcons($('#footer'));
    fixLinks(document);
    renderCart();
    syncCart();
    try { await Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]); } catch (e) { /* ignore */ }
    navigate();
    footerAnimation();
    runIntro();
  }
  boot();
})();
