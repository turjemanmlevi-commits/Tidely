"""Tiny local stand-in for a Shopify storefront, to test shopify-theme/ before uploading.

Serves layout/theme.liquid with the Liquid tags filled in, the theme assets, and an
in-memory AJAX cart (/cart.js, /cart/add.js, /cart/change.js). Not a Liquid engine:
it only understands the handful of tags the Tidely layout uses.
Run: python tools/mock_shopify.py  (http://localhost:5190)
"""
import http.server
import json
import os
import re
import urllib.parse

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
THEME = os.path.join(ROOT, 'shopify-theme')
PRODUCTS = json.load(open(os.path.join(ROOT, 'tools', 'mock_products.json'), encoding='utf-8'))
VARIANTS = {v['id']: (p, v) for p in PRODUCTS for v in p['variants']}
MEMBERSHIP = {
    'care': ['portable-garment-steamer', 'drawer-organizer-17-grid', 'under-bed-storage-bag', 'suede-care-kit'],
    'organize': ['airtight-snack-organizer', 'two-tier-under-sink-organizer', 'olive-oil-sprayer', 'six-tier-plant-stand'],
    'pet-home': ['steam-pet-grooming-brush'],
    'travel': ['stand-up-mesh-vanity-bag', 'double-layer-tech-organizer'],
}
CART = []  # [{key, variant_id, quantity}]


def cart_json():
    items = []
    for line in CART:
        p, v = VARIANTS[line['variant_id']]
        items.append({
            'key': line['key'], 'handle': p['handle'], 'product_title': p['title'], 'variant_id': v['id'],
            'quantity': line['quantity'], 'final_line_price': v['price'] * line['quantity'], 'image': p['images'][0],
            'options_with_values': [{'name': p['options'][0], 'value': v['option1']}],
        })
    return {'items': items, 'item_count': sum(i['quantity'] for i in items), 'total_price': sum(i['final_line_price'] for i in items), 'currency': 'EUR'}


def render(path):
    layout = open(os.path.join(THEME, 'layout', 'theme.liquid'), encoding='utf-8').read()
    parts = [p for p in path.split('/') if p]
    template = 'index'
    native = ''
    if parts[:1] == ['products']:
        template = 'product'
    elif parts[:1] == ['collections']:
        template = 'collection'
    elif parts[:1] == ['pages']:
        template = 'page'
    elif parts[:1] == ['policies']:
        template = 'policy'
        native = '<div class="shopify-policy__container"><div class="shopify-policy__title"><h1>Refund policy</h1></div><div class="shopify-policy__body"><p>Policy text managed in Shopify admin.</p></div></div>'
    elif parts:
        template = '404'
    current = next((p for p in PRODUCTS if template == 'product' and p['handle'] == parts[1]), None)
    membership = {h: [c] for c, hs in MEMBERSHIP.items() for h in hs}
    data = ('<script>window.TIDELY_SHOP = ' + json.dumps({
        'assetBase': '/assets/', 'template': template, 'currency': 'EUR', 'products': PRODUCTS,
        'current': current, 'membership': membership,
    }) + ';</script>')
    html = layout.replace("{% render 'tidely-data' %}", data)
    html = html.replace('{{ content_for_layout }}', native).replace('{{ content_for_header }}', '')
    html = re.sub(r"\{\{\s*'([^']+)'\s*\|\s*asset_url\s*\|\s*stylesheet_tag\s*\}\}", r'<link rel="stylesheet" href="/assets/\1">', html)
    html = re.sub(r"\{\{\s*'([^']+)'\s*\|\s*asset_url\s*\}\}", r'/assets/\1', html)
    html = re.sub(r'\{%-?.*?-?%\}', '', html, flags=re.S)
    html = re.sub(r'\{\{-?.*?-?\}\}', '', html, flags=re.S)
    return html


class H(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def send(self, code, body, ctype):
        b = body if isinstance(body, bytes) else body.encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', ctype)
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        url = urllib.parse.urlparse(self.path)
        if url.path == '/cart.js':
            return self.send(200, json.dumps(cart_json()), 'application/json')
        if url.path.startswith('/assets/'):
            f = os.path.join(THEME, 'assets', os.path.basename(url.path))
            if not os.path.exists(f):
                return self.send(404, 'missing', 'text/plain')
            ext = os.path.splitext(f)[1]
            ctype = {'.css': 'text/css', '.js': 'application/javascript', '.webp': 'image/webp', '.svg': 'image/svg+xml'}.get(ext, 'application/octet-stream')
            return self.send(200, open(f, 'rb').read(), ctype)
        if url.path == '/checkout':
            return self.send(200, '<h1>Checkout (mock)</h1>', 'text/html')
        return self.send(200, render(url.path), 'text/html; charset=utf-8')

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        body = json.loads(self.rfile.read(int(self.headers.get('Content-Length', 0))) or b'{}')
        if url.path == '/cart/add.js':
            for it in body.get('items', []):
                vid = int(it['id'])
                if vid not in VARIANTS:
                    return self.send(422, json.dumps({'description': 'variant not found'}), 'application/json')
                line = next((l for l in CART if l['variant_id'] == vid), None)
                if line:
                    line['quantity'] += int(it.get('quantity', 1))
                else:
                    CART.append({'key': f'{vid}:abc', 'variant_id': vid, 'quantity': int(it.get('quantity', 1))})
            return self.send(200, json.dumps({'items': body.get('items', [])}), 'application/json')
        if url.path == '/cart/change.js':
            line = next((l for l in CART if l['key'] == body.get('id')), None)
            if line:
                line['quantity'] = int(body.get('quantity', 0))
                if line['quantity'] <= 0:
                    CART.remove(line)
            return self.send(200, json.dumps(cart_json()), 'application/json')
        return self.send(404, 'no', 'text/plain')


if __name__ == '__main__':
    http.server.ThreadingHTTPServer(('127.0.0.1', 5190), H).serve_forever()
