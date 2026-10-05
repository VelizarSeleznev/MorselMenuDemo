import { readFileSync, readdirSync } from 'node:fs';
import assert from 'node:assert/strict';
const files = readdirSync('public/models/morsel').filter((f) =>
  f.endsWith('.glb'),
);
assert.equal(files.length, 18);
for (const file of files) {
  const b = readFileSync('public/models/morsel/' + file);
  assert.equal(b.readUInt32LE(0), 0x46546c67);
  assert.equal(b.readUInt32LE(8), b.length);
  const j = JSON.parse(b.subarray(20, 20 + b.readUInt32LE(12)).toString());
  assert(j.meshes.length);
  assert(!j.images?.some((i) => i.uri));
  assert(!j.buffers.some((v) => v.uri));
  if (file.startsWith('burger'))
    assert.equal(
      j.nodes.filter((n) => n.name?.startsWith('beef patty')).length,
      file.includes('regular') ? 2 : 1,
    );
  if (file.startsWith('icecream'))
    assert.equal(
      j.nodes.filter((n) => n.name?.startsWith('vanilla scoop')).length,
      file.includes('regular') ? 2 : 1,
    );
}
console.log(
  'Validated 18 original self-contained models and discrete serving counts.',
);
