// Simulate products imported with DSers: AliExpress handles/titles/variant names, some products missing.
let id = 5000;
const mk = (handle, title, tags, optName, vals, type = '') => ({
  id: ++id, handle, title, tags, type, available: true, description: '<p>Imported from AliExpress.</p>', options: [optName],
  images: [`//cdn.example.com/${handle}.jpg`], price: vals[0][1],
  variants: vals.map(([v, price, available = true]) => ({ id: ++id, title: v, option1: v, option2: null, option3: null, price, compare_at_price: null, available })),
});
const out = [
  mk('transparent-mesh-toiletry-bag-portable-makeup-organizer-1005012396502213', 'Transparent Mesh Toiletry Bag Portable Makeup Organizer Travel', ['tidely:stand-up-mesh-vanity-bag'], 'Color', [['Gray', 945], ['White', 945], ['Black', 945], ['Pink', 945]]),
  mk('portable-garment-steamer', 'Portable Garment Steamer', [], 'Title', [['Default Title', 7145]]),
  mk('6-tier-plant-stand-metal-flower-shelf-1005012650053535', '6-Tier Plant Stand', [], 'Title', [['Default Title', 2995]]),
  mk('under-bed-storage-bag-zipper-quilt-organizer-1005013030199030', 'Under Bed Storage Bag Zipper Quilt Organizer', ['tidely:under-bed-storage-bag'], 'Size', [['Large', 1095], ['X-Large', 1145]]),
  mk('airtight-snack-box-divided-1005009421893095', 'Airtight Snack Organizer', [], 'Title', [['Default Title', 1995]]),
  mk('random-extra-product-1234', 'Random Extra Product From AliExpress', [], 'Title', [['Default Title', 999]]),
];
require('fs').writeFileSync(__dirname + '/mock_products.json', JSON.stringify(out));
console.log(out.length, 'dsers-style products');
