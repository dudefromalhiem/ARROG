const assert = require('assert');
const helpers = require('../browser-compat-helpers.js');

assert.strictEqual(helpers.getSameDocumentAnchorTarget('#section-2', 'https://example.com/page.html'), 'section-2');
assert.strictEqual(helpers.getSameDocumentAnchorTarget('https://example.com/page.html#details', 'https://example.com/page.html?view=1'), 'details');
assert.strictEqual(helpers.getSameDocumentAnchorTarget('https://example.com/other.html#details', 'https://example.com/page.html'), null);
assert.strictEqual(helpers.getSameDocumentAnchorTarget('https://example.com/page.html', 'https://example.com/page.html'), null);

console.log('browser helper checks passed');
