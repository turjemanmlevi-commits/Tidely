"""Build the Tidely Shopify theme from the standalone site in tidely-web/.

The theme reuses the exact same CSS, JavaScript and images, so the Shopify store
looks and moves exactly like the prototype. Run:  python tools/build_theme.py
Output: shopify-theme/ (theme folder) and shopify-theme.zip (upload in
Online Store > Themes > Add theme > Upload zip file).
"""
import io
import json
import os
import re
import shutil
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WEB = os.path.join(ROOT, 'tidely-web')
OUT = os.path.join(ROOT, 'shopify-theme')
ZIP = os.path.join(ROOT, 'shopify-theme.zip')

POLICY_PATHS = {'shipping': 'shipping-policy', 'returns': 'refund-policy', 'privacy': 'privacy-policy', 'terms': 'terms-of-service'}


def to_path(h):
    path = h.lstrip('#')
    parts = [p for p in path.split('/') if p]
    if not parts:
        return '/'
    if parts[0] == 'shop':
        return f'/collections/{parts[1]}' if len(parts) > 1 else '/collections/all'
    if parts[0] == 'product':
        return f'/products/{parts[1]}'
    if parts[0] in ('about', 'faq', 'contact'):
        return f'/pages/{parts[0]}'
    if parts[0] == 'policy':
        return f'/policies/{POLICY_PATHS.get(parts[1], parts[1])}'
    return '/'


def w(rel, text):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    io.open(p, 'w', encoding='utf-8', newline='\n').write(text)


def section(name, body, schema_name):
    return body.rstrip() + '\n\n{% schema %}\n' + json.dumps({'name': schema_name, 'settings': []}, indent=2) + '\n{% endschema %}\n'


# Clear old files one by one (OneDrive can briefly lock folders, so never rmtree the whole tree).
if os.path.exists(OUT):
    for base, _, files in os.walk(OUT):
        for f in files:
            try:
                os.remove(os.path.join(base, f))
            except OSError:
                pass

# ------------------------------------------------------------------ assets (flat)
os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
for sub in ('assets/css', 'assets/js', 'assets/vendor', 'assets/img', 'assets'):
    d = os.path.join(WEB, sub)
    for f in os.listdir(d):
        fp = os.path.join(d, f)
        if os.path.isfile(fp):
            shutil.copy2(fp, os.path.join(OUT, 'assets', f))

# ------------------------------------------------------------------ layout/theme.liquid
html = io.open(os.path.join(WEB, 'index.html'), encoding='utf-8').read()
body = html[html.index('<body>') + len('<body>'):html.index('<script src="assets/vendor/gsap.min.js">')]
head_script = re.search(r'<script>document\.documentElement.*?</script>', html).group(0)

body = re.sub(r'href="(#/[^"]*)"', lambda m: f'href="{to_path(m.group(1))}"', body)
body = body.replace('<main id="main" tabindex="-1"></main>', '<main id="main" tabindex="-1">\n  {{ content_for_layout }}\n</main>')
assert '{{ content_for_layout }}' in body

scripts = ''.join(f"<script src=\"{{{{ '{f}' | asset_url }}}}\" defer></script>\n" for f in (
    'gsap.min.js', 'ScrollTrigger.min.js', 'Flip.min.js', 'SplitText.min.js', 'CustomEase.min.js', 'lenis.min.js', 'icons.js', 'products.js', 'app.js'))

theme = """<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ page_title }}{% unless page_title contains shop.name %} | {{ shop.name }}{% endunless %}</title>
{%- if page_description %}<meta name="description" content="{{ page_description | escape }}">{% endif %}
<link rel="canonical" href="{{ canonical_url }}">
<meta name="theme-color" content="#26342F">
<meta property="og:site_name" content="{{ shop.name }}">
<meta property="og:url" content="{{ canonical_url }}">
<meta property="og:title" content="{{ page_title | escape }}">
<meta property="og:type" content="{% if template.name == 'product' %}product{% else %}website{% endif %}">
<meta property="og:description" content="{{ page_description | default: shop.description | escape }}">
{%- if template.name == 'product' and product.featured_image %}<meta property="og:image" content="https:{{ product.featured_image | image_url: width: 1200 }}">{% endif %}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" type="image/svg+xml" href="{{ 'favicon.svg' | asset_url }}">
""" + head_script + """
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
{%- if template.name == 'index' %}<link rel="preload" as="image" href="{{ 'hero-plant.webp' | asset_url }}">{% endif %}
{{ 'tidely.css' | asset_url | stylesheet_tag }}
{{ content_for_header }}
</head>
<body class="template-{{ template.name }}">
""" + body.strip() + "\n\n{% render 'tidely-data' %}\n" + scripts + """</body>
</html>
"""
w('layout/theme.liquid', theme)

# ------------------------------------------------------------------ snippets/tidely-data.liquid
w('snippets/tidely-data.liquid', """{%- comment -%}
  Live store data for assets/app.js: products (price, variants, stock, images),
  collection membership, the asset base URL and the current template.
{%- endcomment -%}
<script>
  window.TIDELY_SHOP = {
    assetBase: {{ 'app.js' | asset_url | split: 'app.js' | first | json }},
    template: {{ template.name | json }},
    currency: {{ cart.currency.iso_code | json }},
    products: [
      {%- for p in collections.all.products -%}
        {{ p | json }}{% unless forloop.last %},{% endunless %}
      {%- endfor -%}
    ],
    current: {% if template.name == 'product' %}{{ product | json }}{% else %}null{% endif %},
    membership: {
      {%- for c in collections -%}
        {%- unless c.handle == 'all' or c.handle == 'frontpage' -%}
          {%- for p in c.products limit: 50 -%}
            {{ p.handle | json }}: [{{ c.handle | json }}],
          {%- endfor -%}
        {%- endunless -%}
      {%- endfor -%}
    }
  };
</script>
""")

# ------------------------------------------------------------------ sections
w('sections/tidely-route.liquid', section('tidely-route', """{%- comment -%}
  The storefront script (assets/app.js) renders this page with the Tidely design.
  The noscript block below is the plain fallback for browsers without JavaScript.
{%- endcomment -%}
<noscript>
  <div class="native-fallback">
    {%- case template.name -%}
      {%- when 'product' -%}
        <h1>{{ product.title }}</h1>
        <p>{{ product.price | money }}</p>
        {{ product.description }}
      {%- when 'collection' -%}
        <h1>{{ collection.title }}</h1>
        <ul>{% for p in collection.products %}<li><a href="{{ p.url }}">{{ p.title }}</a> {{ p.price | money }}</li>{% endfor %}</ul>
      {%- else -%}
        <h1>{{ shop.name }}</h1>
        <p><a href="{{ routes.all_products_collection_url }}">Shop the collection</a></p>
    {%- endcase -%}
  </div>
</noscript>""", 'Tidely storefront'))

w('sections/native-page.liquid', section('native-page', """<h1>{{ page.title }}</h1>
<div class="native-rte">{{ page.content }}</div>""", 'Page'))

w('sections/native-cart.liquid', section('native-cart', """<h1>Your bag</h1>
{%- if cart.item_count > 0 -%}
  <form action="{{ routes.cart_url }}" method="post" class="native-cart">
    <ul>
      {%- for item in cart.items -%}
        <li>
          <a href="{{ item.url }}">{{ item.product.title }}</a>
          {%- unless item.product.has_only_default_variant %}<span>{{ item.variant.title }}</span>{% endunless %}
          <label for="qty-{{ forloop.index }}" class="sr-only">Quantity for {{ item.product.title | escape }}</label>
          <input id="qty-{{ forloop.index }}" type="number" name="updates[]" value="{{ item.quantity }}" min="0">
          <span>{{ item.final_line_price | money }}</span>
        </li>
      {%- endfor -%}
    </ul>
    <p>Subtotal: {{ cart.total_price | money }}. Prices include VAT; shipping is calculated at checkout.</p>
    <button type="submit" name="update" class="btn btn--ghost"><span>Update bag</span></button>
    <button type="submit" name="checkout" class="btn btn--solid"><span>Checkout</span></button>
  </form>
{%- else -%}
  <p>Your bag is empty. <a href="{{ routes.all_products_collection_url }}">Shop the collection</a>.</p>
{%- endif -%}""", 'Cart'))

w('sections/native-search.liquid', section('native-search', """<h1>Search</h1>
<form action="{{ routes.search_url }}" class="native-search">
  <label for="native-q">Search Tidely</label>
  <input id="native-q" type="search" name="q" value="{{ search.terms | escape }}">
  <button type="submit" class="btn btn--solid"><span>Search</span></button>
</form>
{%- if search.performed -%}
  <ul class="native-results">
    {%- for item in search.results -%}
      <li><a href="{{ item.url }}">{{ item.title }}</a></li>
    {%- else -%}
      <li>No results for “{{ search.terms | escape }}”. Try “bag”, “drawer” or “steamer”.</li>
    {%- endfor -%}
  </ul>
{%- endif -%}""", 'Search'))

w('sections/native-blog.liquid', section('native-blog', """<h1>{{ blog.title }}</h1>
<ul class="native-results">{% for article in blog.articles %}<li><a href="{{ article.url }}">{{ article.title }}</a></li>{% endfor %}</ul>""", 'Blog'))

w('sections/native-article.liquid', section('native-article', """<h1>{{ article.title }}</h1>
<div class="native-rte">{{ article.content }}</div>""", 'Article'))

w('sections/password.liquid', section('password', """<div class="pw">
  <p class="pw__logo">TIDELY</p>
  <h1 class="pw__title">Opening <em>soon.</em></h1>
  {%- if shop.password_message != blank %}<p class="pw__msg">{{ shop.password_message }}</p>{% endif %}
  {%- form 'storefront_password' -%}
    {{ form.errors | default_errors }}
    <label for="pw-input">Store password</label>
    <div class="pw__row">
      <input id="pw-input" type="password" name="password" autocomplete="current-password" required>
      <button type="submit">Enter</button>
    </div>
  {%- endform -%}
</div>""", 'Password'))

# ------------------------------------------------------------------ templates
route = {'sections': {'main': {'type': 'tidely-route', 'settings': {}}}, 'order': ['main']}
for t in ('index', 'product', 'collection', 'list-collections', '404'):
    w(f'templates/{t}.json', json.dumps(route, indent=2) + '\n')
for t, sec in (('page', 'native-page'), ('cart', 'native-cart'), ('search', 'native-search'), ('blog', 'native-blog'), ('article', 'native-article')):
    w(f'templates/{t}.json', json.dumps({'sections': {'main': {'type': sec, 'settings': {}}}, 'order': ['main']}, indent=2) + '\n')
w('templates/password.json', json.dumps({'layout': 'password', 'sections': {'main': {'type': 'password', 'settings': {}}}, 'order': ['main']}, indent=2) + '\n')

# ------------------------------------------------------------------ password layout
w('layout/password.liquid', """<!doctype html>
<html lang="{{ request.locale.iso_code }}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ shop.name }}</title>
<meta name="theme-color" content="#26342F">
<link rel="icon" type="image/svg+xml" href="{{ 'favicon.svg' | asset_url }}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Bodoni+Moda:ital,opsz,wght@0,6..96,400..700;1,6..96,400..600&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>
  body { margin: 0; min-height: 100dvh; display: grid; place-items: center; background: #26342F; color: #F7F1E5; font-family: "Jost", "Futura", sans-serif; font-weight: 300; }
  .pw { width: min(30rem, calc(100% - 3rem)); display: grid; gap: 1.25rem; text-align: center; }
  .pw__logo { margin: 0; font-family: "Bodoni Moda", Didot, serif; font-size: 1.4rem; letter-spacing: .3em; color: #F1E0BB; }
  .pw__title { margin: 0; font-family: "Bodoni Moda", Didot, serif; font-weight: 500; font-size: clamp(2.6rem, 8vw, 4.5rem); line-height: 1; }
  .pw__title em { color: #F1E0BB; }
  .pw__msg { margin: 0; color: rgba(247, 241, 229, .74); }
  .pw form { display: grid; gap: .6rem; margin-top: 1rem; text-align: left; }
  .pw label { font-size: .72rem; font-weight: 500; letter-spacing: .2em; text-transform: uppercase; color: #F1E0BB; }
  .pw__row { display: flex; gap: .5rem; padding: .35rem; border-radius: 999px; border: 1px solid rgba(241, 224, 187, .34); }
  .pw input { flex: 1; min-width: 0; border: 0; background: transparent; color: #F7F1E5; font: inherit; padding: 0 1rem; outline: none; }
  .pw button { border: 0; border-radius: 999px; padding: .85rem 1.5rem; background: #F1E0BB; color: #172923; font: inherit; font-weight: 500; letter-spacing: .16em; text-transform: uppercase; font-size: .78rem; cursor: pointer; }
  .pw input:focus-visible, .pw button:focus-visible { outline: 2px solid #F1E0BB; outline-offset: 3px; }
  .pw .errors { color: #f3c4b8; font-size: .9rem; }
</style>
{{ content_for_header }}
</head>
<body>
{{ content_for_layout }}
</body>
</html>
""")

# ------------------------------------------------------------------ config + locales
w('config/settings_schema.json', json.dumps([{
    'name': 'theme_info', 'theme_name': 'Tidely', 'theme_version': '1.0.0', 'theme_author': 'Tidely',
    'theme_documentation_url': 'https://tidely-iota.vercel.app', 'theme_support_url': 'https://tidely-iota.vercel.app',
}], indent=2) + '\n')
w('config/settings_data.json', json.dumps({'current': {}}, indent=2) + '\n')
w('locales/en.default.json', json.dumps({'general': {'password_page': {'title': 'Opening soon'}}}, indent=2) + '\n')

# ------------------------------------------------------------------ zip (theme folders at the zip root)
if os.path.exists(ZIP):
    os.remove(ZIP)
n = 0
with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
    for base, _, files in os.walk(OUT):
        for f in files:
            full = os.path.join(base, f)
            z.write(full, os.path.relpath(full, OUT).replace(os.sep, '/'))
            n += 1
print(f'{n} files -> {ZIP} ({os.path.getsize(ZIP) / 1e6:.1f} MB)')
