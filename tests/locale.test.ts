import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { menu, variantFor, priceFor } from '../lib/menu.ts';
import { executeMenuTool } from '../lib/assistant.ts';
const translations = JSON.parse(
  readFileSync(new URL('../lib/translations.json', import.meta.url), 'utf8'),
);
test('every menu label, ingredient, request and serving has both translations', () => {
  for (const d of menu)
    for (const key of [
      d.name,
      d.subtitle,
      d.category,
      d.tag,
      d.ingredients,
      ...d.allergens,
      ...(d.requests || []),
      variantFor(d, 'small'),
      variantFor(d, 'regular'),
    ])
      for (const lang of ['da', 'ru'])
        assert.ok(translations[key]?.[lang], `${lang}: ${key}`);
});
test('scoops are a serving choice, distinct from quantity ordered', () => {
  const d = menu.find((d) => d.id === 'icecream')!;
  assert.equal(variantFor(d, 'regular'), '2 scoops');
  const result = executeMenuTool(
    'edit_basket',
    {
      expectedVersion: 0,
      actions: [
        {
          action: 'add',
          id: 'icecream',
          portion: 'regular',
          quantity: 1,
          requestedBy: 'One cup with two scoops',
        },
      ],
    },
    { basket: [], version: 0, selectedDish: null, selectedPortion: 'small' },
  );
  assert.equal(result.basket?.[0].quantity, 1);
  assert.equal(priceFor(d, 'regular'), 45);
});
