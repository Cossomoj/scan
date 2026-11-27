import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pngDataUrlToBlob} from '../src/dataUrlBlob.js';

test('converts a canvas PNG data URL to a PNG blob without a network request', async () => {
  const png = Uint8Array.from([137,80,78,71,13,10,26,10]);
  const blob = pngDataUrlToBlob('data:image/png;base64,iVBORw0KGgo=');
  assert.equal(blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await blob.arrayBuffer()), png);
  assert.throws(() => pngDataUrlToBlob('https://example.test/image.png'));
  assert.throws(() => pngDataUrlToBlob('data:image/png;base64,%%%'));
});
