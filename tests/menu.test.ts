import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  executeMenuTool,
  validLines,
  type MenuContext,
} from '../lib/assistant.ts';
const base: MenuContext = {
  basket: [
    { id: 'burger', portion: 'regular', quantity: 1 },
    { id: 'icecream', portion: 'small', quantity: 2 },
  ],
  version: 3,
  selectedDish: null,
  selectedPortion: 'regular',
};
const edit = (actions: unknown[], version = 3) =>
  executeMenuTool('edit_basket', { expectedVersion: version, actions }, base);
const action = (op: string, id: string, portion = 'small', quantity = 1) => ({
  action: op,
  id,
  portion,
  quantity,
  requestedBy: 'Explicit test guest request',
});
test('targeted addition preserves every unrelated basket line', () => {
  const r = edit([action('add', 'pizza')]);
  assert.deepEqual(r.basket?.slice(0, 2), base.basket);
  assert.equal(r.basket?.length, 3);
  assert.equal(r.result.kitchenOrderPlaced, false);
});
test('removal removes only requested quantity and preserves others', () => {
  assert.deepEqual(edit([action('remove', 'icecream')]).basket, [
    base.basket[0],
    { ...base.basket[1], quantity: 1 },
  ]);
});
test('resize preserves quantity and other dishes', () => {
  const r = edit([action('resize', 'icecream', 'regular', 2)]);
  assert.deepEqual(r.basket, [
    base.basket[0],
    { ...base.basket[1], portion: 'regular' },
  ]);
});
test('stale version and missing request evidence fail without mutation', () => {
  assert.equal(
    edit([action('remove', 'icecream')], 2).result.error,
    'basket_changed',
  );
  assert.equal(
    edit([{ ...action('add', 'pizza'), requestedBy: '' }]).basket,
    undefined,
  );
});
test('batch is atomic when a later action is invalid', () => {
  assert.equal(
    edit([action('add', 'pizza'), action('remove', 'cake')]).basket,
    undefined,
  );
  assert.equal(base.basket.length, 2);
});
test('conflicting actions on one dish rejected', () => {
  assert.equal(
    edit([action('add', 'icecream'), action('remove', 'icecream')]).result
      .error,
    'conflicting_actions',
  );
});
test('invalid dish, quantities and portion rejected', () => {
  for (const a of [
    action('add', 'sushi'),
    action('add', 'pizza', 'huge'),
    action('add', 'pizza', 'small', -1),
    action('add', 'pizza', 'small', 21),
  ])
    assert.equal(edit([a]).basket, undefined);
  assert.equal(validLines([...base.basket, ...base.basket]), false);
});
test('no full replacement, proposal or kitchen tool exists', () => {
  for (const name of ['update_basket', 'propose_basket', 'place_order'])
    assert.equal(
      executeMenuTool(name, { items: [] }, base).result.error,
      'unknown_tool',
    );
});
test('recommendations never mutate', () => {
  const r = executeMenuTool(
    'show_dishes',
    {
      items: [{ id: 'icecream', portion: 'small' }],
      reason: 'A small sweet option',
    },
    base,
  );
  assert.equal(r.basket, undefined);
  assert.equal(r.recommendations?.length, 1);
});
test('explicit no-change words veto a valid model action without a confirmation UI', () => {
  for (const latestUserText of [
    'Do not change my basket',
    "Don't touch the cart",
    'Нет, я просто спрашивал про мороженое. Не меняй корзину.',
    'Ændr ikke min kurv',
  ]) {
    const r = executeMenuTool(
      'edit_basket',
      { expectedVersion: 3, actions: [action('remove', 'icecream')] },
      { ...base, latestUserText },
    );
    assert.equal(r.result.error, 'guest_requested_no_change');
    assert.equal(r.basket, undefined);
  }
});
test('ordinary explicit requests still act directly', () => {
  const r = executeMenuTool(
    'edit_basket',
    { expectedVersion: 3, actions: [action('remove', 'icecream')] },
    { ...base, latestUserText: 'Remove one small ice cream' },
  );
  assert.equal(r.basket?.[1].quantity, 1);
});
test('dish notes target one existing line and preserve quantities and others', () => {
  const r = executeMenuTool(
    'set_dish_note',
    {
      expectedVersion: 3,
      id: 'burger',
      portion: 'regular',
      note: 'No onions; sauce on the side',
    },
    base,
  );
  assert.equal(r.basket?.[0].note, 'No onions; sauce on the side');
  assert.deepEqual(r.basket?.[1], base.basket[1]);
  assert.equal(r.basket?.[0].quantity, 1);
  const resized = executeMenuTool(
    'edit_basket',
    { expectedVersion: 4, actions: [action('resize', 'burger', 'small')] },
    { ...base, basket: r.basket!, version: 4 },
  );
  assert.equal(resized.basket?.[0].note, 'No onions; sauce on the side');
});
test('notes reject stale, absent dishes and overlong text', () => {
  for (const args of [
    { expectedVersion: 2, id: 'burger', portion: 'regular', note: 'No onions' },
    { expectedVersion: 3, id: 'cake', portion: 'small', note: 'No cream' },
    {
      expectedVersion: 3,
      id: 'burger',
      portion: 'regular',
      note: 'x'.repeat(241),
    },
  ])
    assert.equal(
      executeMenuTool('set_dish_note', args, base).basket,
      undefined,
    );
});

test('additions and preparation notes apply together atomically', () => {
  const result = edit([
    { ...action('add', 'pizza'), note: 'No basil' },
    { ...action('add', 'lemonade'), note: 'No ice' },
  ]);
  assert.equal(result.basket?.find((l) => l.id === 'pizza')?.note, 'No basil');
  assert.equal(result.basket?.find((l) => l.id === 'lemonade')?.note, 'No ice');
  assert.deepEqual(result.basket?.slice(0, 2), base.basket);
  const invalid = edit([
    { ...action('add', 'pizza'), note: 'No basil' },
    { ...action('add', 'lemonade'), note: 'x'.repeat(241) },
  ]);
  assert.equal(invalid.basket, undefined);
});
test('addition preserves existing note when the guest supplies no new note', () => {
  const ctx = {
    ...base,
    basket: [
      {
        id: 'burger',
        portion: 'small' as const,
        quantity: 1,
        note: 'No onions',
      },
    ],
  };
  const result = executeMenuTool(
    'edit_basket',
    { expectedVersion: 3, actions: [action('add', 'burger')] },
    ctx,
  );
  assert.equal(result.basket?.[0].note, 'No onions');
  assert.equal(result.basket?.[0].quantity, 2);
});
