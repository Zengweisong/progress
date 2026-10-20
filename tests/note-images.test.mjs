import test from 'node:test';
import assert from 'node:assert/strict';
import { imageSource, portableMarkdown } from '../public/note-images.js';
import { seedData, validateData } from '../public/data.js';
import { mergeWorkspaces } from '../public/sync-merge.js';
const asset = { id: 'image-1', name: '示意图.png', mime: 'image/png', data: 'data:image/png;base64,aGVsbG8=' };

test('image attachments survive backup validation and independent sync edits', () => {
  const base = seedData(), local = structuredClone(base), remote = structuredClone(base);
  local.notes[0].attachments = [asset]; local.notes[0].body += '\n\n![示意图](attachment:image-1)';
  remote.notes[1].body = '另一篇文章的编辑';
  const { data, conflicts } = mergeWorkspaces(base, local, remote);
  assert.equal(conflicts.length, 0); assert.deepEqual(data.notes[0].attachments, [asset]);
  assert.deepEqual(validateData(JSON.parse(JSON.stringify(data))), data);
  assert.equal(imageSource('attachment:image-1', data.notes[0].attachments), asset.data);
  assert.equal(portableMarkdown('![示意图](attachment:image-1)', [asset]), `![示意图](${asset.data})`);
  assert.equal(imageSource('attachment:missing', [asset]), '');
  assert.equal(imageSource('javascript:alert(1)'), '');
});

test('attachment validation rejects executable formats, duplicate ids and oversized payloads', () => {
  for (const assets of [
    [{ ...asset, mime: 'image/svg+xml', data: 'data:image/svg+xml;base64,aGVsbG8=' }],
    [{ ...asset, data: 'javascript:alert(1)' }],
    [asset, asset], [{ ...asset, id: 'bad/id' }],
    [{ ...asset, data: 'data:image/png;base64,' + 'a'.repeat(400000) }],
  ]) {
    const data = seedData(); data.notes[0].attachments = assets;
    assert.throws(() => validateData(data));
  }
});
