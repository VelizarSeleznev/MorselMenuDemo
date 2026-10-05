// Original Morsel geometry: no downloaded meshes, textures, or external assets.
import * as T from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { writeFileSync } from 'node:fs';
globalThis.FileReader = class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((v) => {
      this.result = v;
      this.onloadend?.();
    });
  }
};
let group, seed;
const sphere = new T.SphereGeometry(1, 24, 14);
const sesame = new T.SphereGeometry(1, 8, 6);
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const material = (color, roughness = 0.65) =>
  new T.MeshStandardMaterial({ color, roughness });
const mats = {
  plate: material('#ece7dc', 0.28),
  rim: material('#284f43', 0.35),
  bun: material('#c88332'),
  crumb: material('#f1c875'),
  beef: material('#513023'),
  cheese: material('#efb72e'),
  tomato: material('#ce4530'),
  leaf: material('#497e37'),
  leaf2: material('#7ea34a'),
  cream: material('#fff0cc'),
  red: material('#bb3541'),
  cake: material('#bd773c'),
  choc: material('#512c23'),
  glass: new T.MeshPhysicalMaterial({
    color: '#e3f3ed',
    roughness: 0.12,
    transmission: 0.8,
    thickness: 0.06,
    ior: 1.45,
  }),
  water: material('#80babc', 0.2),
  lemon: material('#f2d660'),
  coffee: material('#38271e'),
  foam: material('#bc864e'),
};
function mesh(
  geo,
  mat,
  pos = [0, 0, 0],
  scale = [1, 1, 1],
  rot = [0, 0, 0],
  name = '',
) {
  const m = new T.Mesh(geo, typeof mat === 'string' ? mats[mat] : mat);
  m.position.set(...pos);
  m.scale.set(...scale);
  m.rotation.set(...rot);
  m.name = name;
  group.add(m);
  return m;
}
const ball = (mat, p, s, name) => mesh(sphere, mat, p, s, [0, 0, 0], name);
const cyl = (mat, r, h, p, rt = r, name = '') =>
  mesh(
    new T.CylinderGeometry(rt, r, h, 48),
    mat,
    p,
    [1, 1, 1],
    [0, 0, 0],
    name,
  );
const box = (mat, p, s, rot = [0, 0, 0]) =>
  mesh(new T.BoxGeometry(...s), mat, p, [1, 1, 1], rot);
function ring(mat, r, t, p, rot = [Math.PI / 2, 0, 0]) {
  return mesh(new T.TorusGeometry(r, t, 8, 64), mat, p, [1, 1, 1], rot);
}
function plate(r = 1.5) {
  cyl('plate', r, 0.085, [0, 0.07, 0]);
  ring('plate', r - 0.05, 0.06, [0, 0.12, 0]);
  ring('rim', r - 0.12, 0.012, [0, 0.165, 0]);
}
function leaf(p, size = 0.25, angle = 0) {
  const m = ball(
    rand() > 0.5 ? 'leaf' : 'leaf2',
    p,
    [size, 0.035, size * 0.5],
    'leaf',
  );
  m.rotation.set((rand() - 0.5) * 0.6, angle, (rand() - 0.5) * 0.6);
  return m;
}
function burger(big) {
  plate();
  cyl('bun', 0.86, 0.22, [0, 0.28, 0], 0.9, 'bottom bun');
  for (let i = 0; i < 13; i++) {
    let a = (i * Math.PI * 2) / 13;
    leaf([Math.cos(a) * 0.66, 0.43, Math.sin(a) * 0.66], 0.32, a);
  }
  let y = 0.53;
  for (let n = 0; n < (big ? 2 : 1); n++) {
    ball('beef', [0, y, 0], [0.86, 0.14, 0.84], 'beef patty');
    for (let i = 0; i < 18; i++) {
      let a = rand() * Math.PI * 2;
      ball(
        'beef',
        [Math.cos(a) * 0.8, y, Math.sin(a) * 0.8],
        [0.08, 0.09, 0.08],
      );
    }
    box(
      'cheese',
      [0, y + 0.135, 0],
      [1.42, 0.045, 1.42],
      [0, 0.28 + n * 0.25, 0],
    );
    y += 0.29;
  }
  for (let i = 0; i < 3; i++) {
    let a = i * 2.094;
    cyl('tomato', 0.35, 0.07, [Math.cos(a) * 0.38, y, Math.sin(a) * 0.38]);
  }
  ring('cream', 0.43, 0.035, [0, y + 0.09, 0]);
  ball('bun', [0, y + 0.24, 0], [0.91, 0.37, 0.88], 'brioche crown');
  for (let i = 0; i < 48; i++) {
    const a = rand() * Math.PI * 2,
      r = Math.sqrt(rand()) * 0.76;
    const h = Math.sqrt(1 - (r * r) / 0.83) * 0.35;
    mesh(
      sesame,
      'cream',
      [Math.cos(a) * r, y + 0.24 + h, Math.sin(a) * r],
      [0.023, 0.009, 0.045],
      [0, a, 0],
      'sesame',
    );
  }
}
function pizza(big) {
  plate(1.75);
  const r = big ? 1.52 : 1.01;
  cyl('bun', r, 0.1, [0, 0.2, 0]);
  cyl('tomato', r * 0.94, 0.025, [0, 0.26, 0]);
  cyl('cheese', r * 0.9, 0.025, [0, 0.28, 0]);
  ring('bun', r - 0.055, 0.085, [0, 0.28, 0]);
  for (let i = 0; i < (big ? 21 : 10); i++) {
    let a = i * 2.399,
      rho = Math.sqrt((i + 0.5) / (big ? 21 : 10)) * r * 0.76;
    let x = Math.cos(a) * rho,
      z = Math.sin(a) * rho;
    cyl('red', 0.14, 0.025, [x, 0.31, z]);
    for (let j = 0; j < 4; j++)
      ball(
        'cream',
        [x + (rand() - 0.5) * 0.15, 0.327, z + (rand() - 0.5) * 0.15],
        [0.017, 0.006, 0.016],
      );
  }
  for (let i = 0; i < 7; i++) {
    let a = rand() * 6.28;
    leaf([Math.cos(a) * r * 0.6, 0.35, Math.sin(a) * r * 0.6], 0.13, a);
  }
}
function salad(big) {
  plate();
  const r = big ? 1.08 : 0.83;
  const pts = [
    [0, 0],
    [r * 0.7, 0],
    [r, 0.28],
    [r * 1.07, 0.47],
    [r * 1.03, 0.5],
    [r * 0.96, 0.3],
    [r * 0.65, 0.07],
    [0, 0.07],
  ].map(([x, y]) => new T.Vector2(x, y));
  mesh(new T.LatheGeometry(pts, 48), 'plate', [0, 0.13, 0]);
  ring('rim', r * 1.05, 0.022, [0, 0.62, 0]);
  for (let i = 0; i < (big ? 44 : 23); i++) {
    let a = i * 2.4,
      rho = Math.sqrt(rand()) * r * 0.85;
    leaf([Math.cos(a) * rho, 0.53 + rand() * 0.28, Math.sin(a) * rho], 0.25, a);
  }
  for (let i = 0; i < (big ? 12 : 6); i++) {
    let a = i * 2.4,
      rho = Math.sqrt(rand()) * r * 0.72;
    let x = Math.cos(a) * rho,
      z = Math.sin(a) * rho;
    ball('tomato', [x, 0.79, z], [0.12, 0.1, 0.12]);
    if (i % 2 === 0) {
      cyl('leaf', 0.15, 0.025, [z, 0.8, x]);
      cyl('cream', 0.12, 0.028, [z, 0.815, x]);
    }
  }
}
function fries(big) {
  plate();
  for (let i = 0; i < (big ? 38 : 19); i++) {
    const a = (rand() - 0.5) * 1.6;
    const x = (rand() - 0.5) * 1.4,
      z = (rand() - 0.5) * 1.05,
      y = 0.22 + Math.floor(i / 9) * 0.095;
    box(
      i % 3 ? 'crumb' : 'bun',
      [x, y, z],
      [0.11, 0.1, 0.62 + rand() * 0.55],
      [0, a, 0],
    );
  }
  for (let i = 0; i < 28; i++) {
    const x = (rand() - 0.5) * 1.3,
      z = rand() - 0.5;
    ball(
      i % 3 ? 'cream' : 'leaf',
      [x, big ? 0.64 : 0.42, z],
      [0.018, 0.012, 0.018],
    );
  }
}
function cake(big) {
  plate();
  const width = big ? 0.9 : 0.48;
  const shape = new T.Shape();
  shape.moveTo(-width, 0.6);
  shape.lineTo(width, 0.6);
  shape.lineTo(0, -0.9);
  shape.closePath();
  let y = 0.17;
  for (const [mat, h] of [
    ['cake', 0.22],
    ['cream', 0.09],
    ['red', 0.055],
    ['cake', 0.22],
    ['cream', 0.09],
    ['cake', 0.22],
    ['cream', 0.07],
  ]) {
    const g = new T.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false });
    g.rotateX(Math.PI / 2);
    mesh(g, mat, [0, y + h, 0]);
    y += h;
  }
  for (let i = 0; i < (big ? 3 : 2); i++) {
    let z = 0.25 - i * 0.36;
    ball('cream', [0, y + 0.1, z], [0.16, 0.13, 0.16]);
    ball('red', [0, y + 0.24, z], [0.12, 0.16, 0.11]);
    for (let j = 0; j < 5; j++)
      ball(
        'crumb',
        [(rand() - 0.5) * 0.14, y + 0.24 + (rand() - 0.5) * 0.12, z - 0.09],
        [0.008, 0.013, 0.006],
      );
    leaf([0, y + 0.37, z], 0.085, i);
  }
}
function icecream(big) {
  plate(1.25);
  cyl('bun', 0.035, 1, [0, 0.65, 0], 0.43, 'waffle cone');
  for (let j = 1; j < 8; j++)
    ring('crumb', 0.035 + j * 0.049, 0.012, [0, 0.15 + j * 0.125, 0]);
  for (let i = 0; i < 12; i++) {
    const a = (i * 6.28) / 12;
    const curve = new T.LineCurve3(
      new T.Vector3(Math.cos(a) * 0.04, 0.17, Math.sin(a) * 0.04),
      new T.Vector3(Math.cos(a) * 0.43, 1.15, Math.sin(a) * 0.43),
    );
    mesh(new T.TubeGeometry(curve, 1, 0.011, 4, false), 'crumb');
  }
  const scoops = big
    ? [
        [0, 1.42, 0],
        [0.08, 2.02, 0],
      ]
    : [[0, 1.42, 0]];
  for (const p of scoops) {
    ball('cream', p, [0.48, 0.43, 0.46], 'vanilla scoop');
    for (let i = 0; i < 18; i++) {
      const a = rand() * 6.28;
      ball(
        'cream',
        [
          p[0] + Math.cos(a) * 0.39,
          p[1] - 0.18 + rand() * 0.1,
          p[2] + Math.sin(a) * 0.39,
        ],
        [0.1, 0.09, 0.1],
      );
    }
    for (let i = 0; i < 22; i++) {
      let a = rand() * 6.28,
        r = rand() * 0.32;
      ball(
        'choc',
        [
          p[0] + Math.cos(a) * r,
          p[1] + Math.sqrt(0.18 - r * r),
          p[2] + Math.sin(a) * r,
        ],
        [0.009, 0.006, 0.009],
      );
    }
  }
}
function lemonade(big) {
  plate(1);
  const h = big ? 1.65 : 1.05;
  const r = 0.49;
  mesh(
    new T.LatheGeometry(
      [
        [0, 0],
        [r, 0],
        [r, h],
        [r - 0.035, h],
        [r - 0.035, 0.06],
        [0, 0.06],
      ].map(([x, y]) => new T.Vector2(x, y)),
      48,
    ),
    'glass',
    [0, 0.17, 0],
  );
  cyl('lemon', r * 0.91, h * 0.83, [0, 0.19 + h * 0.415, 0]);
  ring('glass', r, 0.035, [0, 0.17 + h / 2 + h / 2, 0]);
  for (let i = 0; i < (big ? 5 : 3); i++)
    box(
      'cream',
      [(rand() - 0.5) * 0.4, h * 0.85 + rand() * 0.1, (rand() - 0.5) * 0.4],
      [0.2, 0.16, 0.19],
      [0, rand(), 0.1],
    );
  const slice = cyl('lemon', 0.26, 0.035, [0.46, h, 0.05]);
  slice.rotation.z = Math.PI / 2;
  for (let i = 0; i < 4; i++) leaf([-0.22, h * 0.93 + i * 0.04, -0.1], 0.13, i);
  cyl('rim', 0.027, h * 0.9, [0.17, h * 0.8, -0.16]);
}
function water(big) {
  plate(1);
  const h = big ? 1.7 : 1.12;
  const pts = [
    [0, 0],
    [0.4, 0],
    [0.44, 0.06],
    [0.44, h * 0.66],
    [0.22, h * 0.82],
    [0.18, h],
    [0.14, h],
    [0.16, h * 0.82],
    [0.38, h * 0.65],
    [0.38, 0.08],
    [0, 0.08],
  ].map(([x, y]) => new T.Vector2(x, y));
  mesh(new T.LatheGeometry(pts, 48), 'glass', [0, 0.15, 0]);
  cyl('water', 0.36, h * 0.64, [0, 0.16 + h * 0.32, 0]);
  cyl('rim', 0.2, 0.11, [0, h + 0.15, 0]);
  box('plate', [0, 0.65, 0.435], [0.49, 0.29, 0.014]);
  box('rim', [0, 0.65, 0.45], [0.2, 0.02, 0.01]);
}
function coffee(big) {
  plate(1.1);
  const r = big ? 0.56 : 0.44,
    h = big ? 0.62 : 0.46;
  const pts = [
    [0, 0],
    [r * 0.8, 0],
    [r, h * 0.2],
    [r, h],
    [r - 0.045, h],
    [r - 0.06, 0.09],
    [0, 0.09],
  ].map(([x, y]) => new T.Vector2(x, y));
  mesh(new T.LatheGeometry(pts, 48), 'plate', [0, 0.17, 0]);
  cyl('coffee', r - 0.05, 0.03, [0, h + 0.105, 0]);
  cyl('foam', r - 0.07, 0.014, [0, h + 0.125, 0]);
  ring('plate', 0.22, 0.06, [r + 0.16, h * 0.6 + 0.17, 0], [0, Math.PI / 2, 0]);
  for (let i = 0; i < 30; i++) {
    const a = rand() * 6.28,
      rho = Math.sqrt(rand()) * (r - 0.09);
    ball(
      'coffee',
      [Math.cos(a) * rho, h + 0.136, Math.sin(a) * rho],
      [0.013, 0.004, 0.013],
    );
  }
}
const builders = {
  burger,
  pizza,
  salad,
  fries,
  cake,
  icecream,
  lemonade,
  water,
  coffee,
};
for (const [name, fn] of Object.entries(builders))
  for (const portion of ['small', 'regular']) {
    group = new T.Group();
    seed = 1337;
    group.name = `Morsel original ${name} ${portion}`;
    fn(portion === 'regular');
    group.userData = {
      author: 'Morsel / original procedural geometry',
      portion,
    };
    const data = await new GLTFExporter().parseAsync(group, {
      binary: true,
      onlyVisible: true,
    });
    writeFileSync(
      `public/models/morsel/${name}-${portion}.glb`,
      Buffer.from(data),
    );
    console.log(name, portion, data.byteLength);
  }
