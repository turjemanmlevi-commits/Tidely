// Build Shopify-style product JSON (like {{ product | json }}) from products.js, for local theme testing.
global.window = {};
require('fs');
eval(require('fs').readFileSync(__dirname + '/../tidely-web/assets/js/products.js', 'utf8'));
let id = 1000;
const out = window.TIDELY_PRODUCTS.map((p) => {
  const opts = p.options ? p.options.values : [{ value: 'Default Title', price: p.price }];
  return {
    id: ++id, handle: p.handle, title: p.title, type: p.subtitle, available: true, description: `<p>${p.short}</p>`,
    options: [p.options ? p.options.name : 'Title'],
    images: [`//cdn.example.com/${p.handle}.jpg`],
    price: Math.round((opts[0].price ?? p.price) * 100),
    variants: opts.map((v) => ({ id: ++id, title: v.value, option1: v.value, option2: null, option3: null, price: Math.round((v.price ?? p.price) * 100), compare_at_price: null, available: v.available !== false })),
  };
});
require('fs').writeFileSync(__dirname + '/mock_products.json', JSON.stringify(out));
console.log(out.length, 'products');
