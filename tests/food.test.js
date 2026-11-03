import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../logic.js';
import { MEALS, MENUS, PANTRY } from '../plan.js';

const profile = { sex: 'm', age: 45, heightCm: 175, startWeight: 90, rhr: 70, startDate: '2026-11-09', waterBase: 2500 };
const fresh = () => ({ v: 1, profile: { ...profile }, days: {}, custom: [], shopping: {}, swaps: {}, excluded: [], repeats: [], skipHolds: [], labs: [], bp: [], waist: [] });
const monday = profile.startDate;

// Bangkok dishes and the tags the weekly counters need: purine for beef, shellfish, squid and offal, sugary for drinks only.
const BANGKOK = {
  khaopad: [], khaopadgoong: ['purine'], khaomangai: [], greencurry: [], massaman: [],
  padthai: [], padthaigoong: ['purine'], padseeew: [], radna: [], khaosoi: [], noodlesoup: [], boatnoodles: ['purine'],
  gaitod: [], plapao: [], tomyumgoong: ['purine'], tomkhagai: [], yamwoonsen: ['purine'], hoytod: ['purine'],
  mango: [], roti: [], thaitea: ['sugary'], sweetcoffee: ['sugary'],
};

test('Bangkok dishes are one-tap extras with the right flags', () => {
  assert.equal(new Set(MEALS.map((m) => m.id)).size, MEALS.length, 'meal ids are unique');
  assert.ok(MEALS.length <= 80, `Add food lists the first 80 meals (foodListItems in app.js), and there are ${MEALS.length}`);
  for (const [id, tags] of Object.entries(BANGKOK)) {
    const m = L.MEAL_BY_ID[id];
    assert.ok(m && m.slot === 'extra', `${id} is a loggable extra`);
    assert.deepEqual(m.tags ?? [], tags, id);
  }
  for (const m of MEALS.filter((x) => x.slot === 'extra')) {
    assert.equal(m.where, 'out', m.id);
    assert.ok(m.id.length <= 20, `${m.id}: a restored log keeps 20 characters of the meal id`);
    assert.ok(m.name.length <= 80, `${m.id}: a restored log keeps 80 characters of the name`);
    assert.ok(Number.isInteger(m.kcal) && m.kcal > 0 && Number.isInteger(m.p) && Number.isInteger(m.fib), m.id);
    assert.ok((m.tags ?? []).every((t) => t === 'sugary' || t === 'purine'), m.id);
    if (m.tags?.includes('sugary')) assert.match(m.name, /tea|coffee|drink|juice/i, `${m.id}: sugary means a sugary drink`);
  }
  // The generic red meat extra names pork so it can be logged; no dish is a pork dish, and nothing is alcohol.
  assert.doesNotMatch(MEALS.filter((m) => m.id !== 'redmeat').map((m) => m.name).join('\n'), /\b(pork|moo|ham|bacon)\b/i);
  assert.doesNotMatch(MEALS.map((m) => m.name).join('\n'), /\b(beer|wine|whiske?y|spirits?|cocktail|alcohol)\b/i);
});

test('a logged Bangkok dish keeps its flag through a backup and counts for the week', () => {
  const m = L.MEAL_BY_ID.hoytod;
  const out = L.cleanBackup({ v: 1, days: { '2026-11-10': { foods: [{ name: m.name, slot: 'dinner', kcal: m.kcal, p: m.p, fib: m.fib, ref: m.id, t: '19:30', tags: m.tags }] } } });
  const f = out.days['2026-11-10'].foods[0];
  assert.equal(f.ref, 'hoytod');
  assert.deepEqual(f.tags, ['purine']);
  assert.deepEqual(L.weekCounts(out, monday), { sugary: 0, purine: 1 });
});

test('food search ignores case, spaces and punctuation', () => {
  const find = (q) => MEALS.filter((m) => L.matches(m.name, q)).map((m) => m.id);
  assert.deepEqual(find('padthai'), ['padthai', 'padthaigoong']);
  assert.deepEqual(find('Pad Thai'), ['padthai', 'padthaigoong']);
  assert.ok(find('kra pao').includes('krapao'));
  assert.ok(find('KRAPAO').includes('krapao'));
  assert.ok(find('khao  man').includes('khaomangai'));
  assert.deepEqual(find('lasagne'), []);
  assert.deepEqual(find('saltgrilled'), ['plapao']); // Salt-grilled fish
  assert.deepEqual(find('salt grilled'), ['plapao']);
  assert.deepEqual(find('pad-thai'), ['padthai', 'padthaigoong']);
  assert.ok(find('oyster or mussel omelette hoy tod').includes('hoytod')); // the brackets in the name do not get in the way
  // Letters from any script count, with their marks, and digits too.
  assert.equal(L.matches('ผัดไทย, ร้านป้า', 'ผัดไทย'), true);
  assert.equal(L.matches('ผัดไทย', 'ผดไทย'), false);
  assert.equal(L.matches('Café au lait', 'CAFÉ-AU'), true);
  assert.equal(L.matches('Protein bar 2.0', 'bar 20'), true);
});

test('an excluded meal gives way to a stand-in that keeps each day within 100 kcal', () => {
  const kcal = (items) => L.mealTotals(items.map((it) => it.meal)).kcal;
  const used = [...new Set(MENUS.flat().flatMap((d) => [d.breakfast, d.lunch, d.dinner, ...d.snack]))];
  for (const x of used) {
    const st = fresh();
    st.excluded = [x];
    for (let i = 0; i < 21; i++) {
      const date = L.addDays(monday, i);
      const before = L.menuFor(date, fresh());
      const after = L.menuFor(date, st);
      const ids = after.map((it) => it.meal.id);
      assert.equal(after.length, before.length);
      assert.ok(!ids.includes(x), `${x} is still on ${date}`);
      assert.equal(new Set(ids).size, ids.length, `${date} repeats a meal once ${x} is out`);
      assert.ok(Math.abs(kcal(after) - kcal(before)) <= 100, `without ${x}, ${date} moves by ${kcal(after) - kcal(before)} kcal`);
      after.forEach((it, k) => { if (before[k].meal.id === x) assert.equal(it.meal.where, before[k].meal.where, `${x} on ${date}`); });
    }
  }
});

test('a stand-in is never a meal swapped in elsewhere that day', () => {
  for (let i = 0; i < 21; i++) {
    const date = L.addDays(monday, i);
    const dinner = L.menuFor(date, fresh()).find((x) => x.key === 'dinner').meal.id;
    const st = fresh();
    st.excluded = [dinner];
    const standIn = L.menuFor(date, st).find((x) => x.key === 'dinner').meal.id;
    st.swaps[date] = { lunch: standIn };
    const items = L.menuFor(date, st);
    const ids = items.map((x) => x.meal.id);
    assert.equal(items.find((x) => x.key === 'lunch').meal.id, standIn);
    assert.equal(new Set(ids).size, ids.length, `${date} shows a meal twice: ${ids}`);
  }
});

test('exclusions beat swaps to the meal, keep swaps away from it and undo cleanly', () => {
  const st = fresh();
  st.swaps[monday] = { dinner: 'salmon', lunch: 'tunasalad' };
  st.excluded = ['salmon', 'chxbowl'];
  const items = L.menuFor(monday, st);
  const dinner = items.find((x) => x.key === 'dinner');
  assert.equal(dinner.meal.id, 'fishstir');
  assert.equal(dinner.swapped, false);
  const lunch = items.find((x) => x.key === 'lunch');
  assert.equal(lunch.meal.id, 'tunasalad');
  assert.equal(lunch.planned, 'traybake');
  assert.deepEqual(st.swaps[monday], { dinner: 'salmon', lunch: 'tunasalad' });
  st.excluded = [];
  assert.equal(L.menuFor(monday, st).find((x) => x.key === 'dinner').meal.id, 'salmon');
  assert.ok(L.swapOptions('dinner').some((m) => m.id === 'salmon'));
  assert.ok(!L.swapOptions('dinner', ['salmon']).some((m) => m.id === 'salmon'));
});

test('prep and shopping drop an excluded meal', () => {
  const chorba = (st) => {
    const sessions = L.prepFor(st, monday);
    return {
      steps: sessions.flatMap((s) => s.steps).some((s) => s.startsWith('Lentil chorba')),
      meals: sessions.flatMap((s) => [...s.covers, ...s.freeze]).some((c) => c.name.startsWith('Lentil chorba')),
      lentils: L.shoppingFor(st, monday).flatMap((g) => g.items).some((i) => i.key === 'redlentils'),
    };
  };
  assert.deepEqual(chorba(fresh()), { steps: true, meals: true, lentils: true });
  const st = fresh();
  st.excluded = ['chorba'];
  assert.deepEqual(chorba(st), { steps: false, meals: false, lentils: false });
});

test('with every option excluded the plan keeps its meal', () => {
  const st = fresh();
  st.excluded = L.swapOptions('breakfast').map((m) => m.id);
  assert.equal(L.menuFor(monday, st)[0].meal.id, 'oats');
});

test('excluding a meal already logged that day keeps it on its row', () => {
  const st = fresh();
  const ate = (ref, slot) => { const m = L.MEAL_BY_ID[ref]; return { name: m.name, slot, kcal: m.kcal, p: m.p, fib: m.fib, ref, t: '12:30', tags: [] }; };
  const [mon, tue, wed] = [0, 1, 2].map((i) => L.addDays(monday, i));
  st.days[mon] = { foods: [ate('chxbowl', 'lunch')] };
  st.days[tue] = { foods: [ate('chxbowl', 'dinner'), ate('chorba', 'dinner')] };
  st.swaps[wed] = { lunch: 'tunasalad' };
  st.days[wed] = { foods: [ate('tunasalad', 'lunch')] };
  st.excluded = ['chxbowl', 'tunasalad', 'chorba'];
  const row = (date, key) => L.menuFor(date, st).find((x) => x.key === key);
  assert.deepEqual([row(mon, 'lunch').meal.id, row(mon, 'lunch').swapped], ['chxbowl', false]);
  assert.equal(row(tue, 'lunch').meal.id, 'traybake', 'a log in another slot does not hold the row');
  assert.equal(row(tue, 'dinner').meal.id, 'chorba');
  assert.deepEqual([row(wed, 'lunch').meal.id, row(wed, 'lunch').swapped], ['tunasalad', true]);
  // The chorba eaten on Tuesday stays in that prep session and on the list; the one planned for Sunday goes.
  const [sun, wedPrep] = L.prepFor(st, monday);
  assert.ok(sun.covers.some((c) => c.date === tue && c.name.startsWith('Lentil chorba')));
  assert.ok(![...wedPrep.covers, ...wedPrep.freeze].some((c) => c.name.startsWith('Lentil chorba')));
  assert.ok(L.shoppingFor(st, monday).flatMap((g) => g.items).some((i) => i.key === 'redlentils'));
});

test('a backup keeps known exclusions once and drops the rest', () => {
  const out = L.cleanBackup({
    v: 1, days: {},
    excluded: ['salmon', 'nonsense', 'salmon', 7, { id: 'oats' }, ['oats'], 'constructor', '__proto__', 'toString'],
    swaps: { [monday]: { dinner: 'constructor', lunch: 'toString', breakfast: 'oats' } },
  });
  assert.deepEqual(out.excluded, ['salmon']);
  assert.deepEqual(out.swaps, { [monday]: { breakfast: 'oats' } });
  assert.deepEqual(L.cleanBackup({ v: 1, days: {} }).excluded, []);
  assert.equal(L.MEAL_BY_ID.constructor, undefined);
});

test('the shopping list shares as text, leaving out what is ticked', () => {
  const title = 'Shopping for the week of 9 Nov';
  const all = L.shoppingText(fresh(), monday, title).split('\n');
  assert.equal(all[0], title);
  assert.ok(all.includes('Protein and dairy'));
  assert.ok(all.includes('- Chicken breast: 1 kg'));
  assert.ok(all.includes('- Eggs: 10'));
  assert.ok(all.includes('Check the cupboard'));
  assert.ok(all.includes(`- ${PANTRY[0]}`));
  const st = fresh();
  st.shopping[monday] = { eggs: true, 'pantry:0': true };
  const left = L.shoppingText(st, monday, title).split('\n');
  assert.ok(!left.some((l) => l.startsWith('- Eggs:')));
  assert.ok(!left.includes(`- ${PANTRY[0]}`) && left.includes(`- ${PANTRY[1]}`));
  assert.equal(left.length, all.length - 2);
  const keys = [...L.shoppingFor(st, monday).flatMap((g) => g.items.map((i) => i.key)), ...PANTRY.map((_, i) => `pantry:${i}`)];
  st.shopping[monday] = Object.fromEntries(keys.map((k) => [k, true]));
  assert.equal(L.shoppingText(st, monday, title), title);
});
