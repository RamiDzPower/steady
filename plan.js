// Plan content: training blocks, sessions, exercises, meals, menus, batch cooking, shopping items,
// health targets and reminders. Calories, protein and fibre are estimates for the portions listed.

export const EFFORT = {
  easy: { label: 'Easy', rpe: '3 to 4', talk: 'You can talk in full sentences', hrr: [0.3, 0.4] },
  moderate: { label: 'Moderate', rpe: '5 to 6', talk: 'You can talk, but not sing', hrr: [0.4, 0.6] },
  hard: { label: 'Hard', rpe: '7 to 8', talk: 'Only a few words at a time', hrr: [0.6, 0.8] },
  strength: { label: 'Strength', rpe: '7', talk: 'End each set with 2 to 3 reps left in the tank', hrr: null },
};

export const WATCH_ALERT = 'The app cannot read your heart rate live, so let the Watch warn you instead: in the Workout app, tap the three dots on the workout, then Alerts, Heart Rate, and set this range.';

export const EXERCISES = {
  sitstand: { name: 'Chair sit-to-stand', cue: 'Feet hip-width, arms crossed. Sit back until you touch the chair, then stand up tall without using your hands.', alt: 'At the gym: box squat to a bench.' },
  wallpush: { name: 'Counter push-up', cue: 'Hands on a counter edge, body straight from head to heels. Lower your chest to the edge and push back. A lower surface makes it harder.', alt: 'At the gym: chest press machine.', pic: 'incline-push-up-2' },
  bridge: { name: 'Glute bridge', cue: 'On your back, knees bent, feet flat. Squeeze your glutes and lift your hips until knees, hips and shoulders line up. Pause for a second at the top.', alt: 'At the gym: hip thrust machine.', pic: 'glute-bridge-1' },
  bprow: { name: 'Backpack row', cue: 'Load a backpack with books or water bottles. One hand and knee on a chair, pull the bag to your hip, lower it slowly. Do both sides.', alt: 'At the gym: seated cable row.', pic: 'one-arm-dumbbell-row-1' },
  kneeplank: { name: 'Plank on knees', cue: 'Forearms under shoulders, knees down, a straight line from head to knees. Keep breathing.', alt: 'Harder: full plank.', pic: 'plank-3' },
  goblet: { name: 'Goblet squat', cue: 'Hold a dumbbell or a loaded backpack at your chest. Sit down between your heels to a comfortable depth, chest up, then stand.', alt: 'At the gym: leg press.', pic: 'goblet-squat-1' },
  inclinepush: { name: 'Incline push-up', cue: 'Hands on a bench or sturdy table. Lower with control and keep your body straight.', alt: 'At the gym: chest press machine.', pic: 'incline-push-up-2' },
  splitsquat: { name: 'Supported split squat', cue: 'One foot forward, one back, a hand on a wall or chair. Lower the back knee toward the floor, then push up through the front foot.', alt: 'At the gym: single-leg leg press.' },
  deadbug: { name: 'Dead bug', cue: 'On your back, arms up, knees over hips. Slowly lower the opposite arm and leg while your lower back stays on the floor.', alt: 'Easier: move only the legs.', pic: 'dead-bug-3' },
  carry: { name: 'Farmer carry', cue: 'Hold heavy shopping bags or dumbbells at your sides, stand tall and walk. Shoulders down, slow steps.', alt: 'At the gym: dumbbells or kettlebells.', pic: 'farmer-carry-1' },
  hipthrust: { name: 'Hip thrust', cue: 'Upper back on a bench or sofa edge, feet flat. Drive your hips up, squeeze, lower slowly.', alt: 'At the gym: hip thrust machine or barbell.', pic: 'hip-thrust-1' },
  rdl: { name: 'Romanian deadlift', cue: 'Hold dumbbells or a backpack in front of your thighs. Push your hips back with a flat back until you feel the back of your thighs, then stand up.', alt: 'At the gym: dumbbells or a barbell.', pic: 'dumbbell-romanian-deadlift-1' },
  onearmrow: { name: 'One-arm row', cue: 'Hand and knee on a bench, pull the weight to your hip, lower it slowly.', alt: 'At home: backpack row.', pic: 'one-arm-dumbbell-row-1' },
  stepup: { name: 'Step-up', cue: 'A low step or stair, whole foot on it. Step up, stand tall, step down with control.', alt: 'Harder: hold a backpack.', pic: 'step-up-2' },
  sideplank: { name: 'Side plank on knees', cue: 'Forearm under your shoulder, knees bent. Lift your hips into a straight line.', alt: 'Harder: legs straight.' },
  legpress: { name: 'Leg press', cue: 'Feet shoulder-width in the middle of the platform. Lower until your knees are at about 90 degrees, then press without locking them.', alt: 'At home: goblet squat.', pic: 'leg-press-2' },
  chestpress: { name: 'Chest press machine', cue: 'Handles at mid-chest height. Press out, return slowly.', alt: 'At home: incline push-up.', pic: 'machine-chest-press-1' },
  pulldown: { name: 'Lat pulldown', cue: 'Pull the bar to your upper chest, elbows down and back, then return slowly.', alt: 'At home: backpack row.', pic: 'lat-pulldown-3' },
  cablerow: { name: 'Seated cable row', cue: 'Sit tall, pull the handle to your stomach and squeeze your shoulder blades together.', alt: 'At home: backpack row.', pic: 'seated-row-1' },
  shoulderpress: { name: 'Shoulder press machine', cue: 'Handles at shoulder height. Press up without arching your back.', alt: 'At home: press two water bottles overhead.', pic: 'machine-shoulder-press-1' },
  legcurl: { name: 'Leg curl machine', cue: 'Pad just above your heels. Curl smoothly, lower slowly.', alt: 'At home: glute bridge.', pic: 'leg-curl-1' },
  pallof: { name: 'Pallof press', cue: 'Stand side-on to a cable or band at chest height. Press the handle straight out and resist the twist.', alt: 'At home: dead bug.', pic: 'pallof-press-1' },
  plank: { name: 'Plank', cue: 'Forearms under shoulders, body straight, glutes squeezed. Keep breathing.', alt: 'Easier: plank on knees.', pic: 'plank-1' },
};

// Each exercise row: [exercise id, sets, reps or time, rest in seconds].
export const SESSIONS = {
  walks: {
    name: 'Post-meal walks', kind: 'walk', effort: 'easy', minutes: 20,
    how: 'Walk 10 minutes after lunch and 10 minutes after dinner, starting within half an hour of the meal. Brisk enough that your breathing picks up.',
    why: 'A walk after a meal lowers the blood sugar rise from that meal. On a bad week, keep doing this and drop the rest.',
  },
  longwalk: {
    name: 'Long outdoor walk', kind: 'walk', effort: 'moderate', outdoor: true,
    how: 'Start an Outdoor Walk workout on the Watch and keep a steady pace in the moderate range. Carry water.',
    why: 'The Watch updates your cardio fitness (VO2max) from outdoor walks, runs and hikes, not from indoor workouts.',
  },
  cardio: {
    name: 'Steady cardio', kind: 'cardio', effort: 'moderate',
    how: 'Pick one: incline treadmill walk (start at 5 km/h and a 3 to 5% incline, and raise the incline to stay in range), stationary bike, rowing machine, elliptical or swimming. Start and finish with 5 easy minutes.',
    why: 'Builds the aerobic base that lifts VO2max, with less load on your knees than running.',
  },
  intervals: {
    name: 'Intervals', kind: 'cardio', effort: 'hard',
    how: 'Bike, rower or incline treadmill, not running yet. Warm up for 10 easy minutes, then repeat 2 minutes hard and 2 minutes easy. Finish with 5 easy minutes.',
    why: 'Short hard efforts raise fitness faster once you have a base.',
  },
  strHome: {
    name: 'Strength at home', kind: 'strength', effort: 'strength', minutes: 20,
    how: 'Warm up with 5 minutes of easy walking. Move through the list, resting between sets.',
    why: 'Keeps muscle while you lose fat, and makes daily life and later training easier.',
    exercises: [['sitstand', 2, '10', 60], ['wallpush', 2, '10', 60], ['bridge', 2, '12', 60], ['bprow', 2, '12 each side', 60], ['kneeplank', 2, '20 seconds', 45]],
  },
  strA: {
    name: 'Strength A', kind: 'strength', effort: 'strength', minutes: 30,
    how: 'Home or gym. Warm up with 5 easy minutes, then one light set of the first exercise.',
    why: 'Legs, push and core.',
    exercises: [['goblet', 3, '10', 75], ['inclinepush', 3, '8 to 10', 75], ['splitsquat', 2, '8 each leg', 60], ['deadbug', 2, '8 each side', 45], ['carry', 3, '30 m', 60]],
  },
  strB: {
    name: 'Strength B', kind: 'strength', effort: 'strength', minutes: 30,
    how: 'Home or gym. Warm up with 5 easy minutes, then one light set of the first exercise.',
    why: 'Hips, pull and core.',
    exercises: [['hipthrust', 3, '12', 75], ['rdl', 3, '10', 75], ['onearmrow', 3, '10 each side', 60], ['stepup', 2, '10 each leg', 60], ['sideplank', 2, '20 seconds each side', 45]],
  },
  gymA: {
    name: 'Gym A', kind: 'strength', effort: 'strength', minutes: 40,
    how: 'Warm up for 5 minutes on a bike, then one light set on the leg press. No gym? Use the home option under each exercise.',
    why: 'Machines make it easy to add weight a little at a time.',
    exercises: [['legpress', 3, '10', 90], ['chestpress', 3, '10', 90], ['pulldown', 3, '10', 90], ['hipthrust', 3, '10', 90], ['plank', 3, '30 seconds', 45], ['carry', 3, '40 m', 60]],
  },
  gymB: {
    name: 'Gym B', kind: 'strength', effort: 'strength', minutes: 40,
    how: 'Warm up for 5 minutes on a bike, then one light set of goblet squats. No gym? Use the home option under each exercise.',
    why: 'Machines make it easy to add weight a little at a time.',
    exercises: [['goblet', 3, '10', 90], ['rdl', 3, '10', 90], ['cablerow', 3, '10', 90], ['shoulderpress', 2, '10', 75], ['legcurl', 2, '12', 60], ['pallof', 2, '10 each side', 45]],
  },
  rest: {
    name: 'Rest day', kind: 'rest', effort: 'easy', minutes: 0,
    how: 'No training today. An easy walk is fine, and it is a good day for meal prep.',
    why: 'Recovery is when the training turns into fitness.',
  },
};

// What each exercise works and what it needs, for the library, the filters and the little body maps.
// The parts are what the body map lights up: Legs (front thighs and calves), Glutes (and hamstrings), Chest, Back, Shoulders, Arms, Core.
export const BODY_PARTS = ['Legs', 'Glutes', 'Chest', 'Back', 'Shoulders', 'Arms', 'Core', 'Full body'];
export const EX_INFO = {
  sitstand: { part: 'Legs', muscles: 'Quads, glutes', gear: 'A chair' },
  wallpush: { part: 'Chest', muscles: 'Chest, triceps', gear: 'A counter' },
  bridge: { part: 'Glutes', muscles: 'Glutes, hamstrings', gear: 'Body weight' },
  bprow: { part: 'Back', muscles: 'Upper back, biceps', gear: 'A backpack' },
  kneeplank: { part: 'Core', muscles: 'Abs', gear: 'Body weight' },
  goblet: { part: 'Legs', muscles: 'Quads, glutes', gear: 'A dumbbell or backpack' },
  inclinepush: { part: 'Chest', muscles: 'Chest, triceps', gear: 'A bench' },
  splitsquat: { part: 'Legs', muscles: 'Quads, glutes', gear: 'Body weight' },
  deadbug: { part: 'Core', muscles: 'Abs', gear: 'Body weight' },
  carry: { part: 'Full body', muscles: 'Grip, core, legs', gear: 'Dumbbells or bags' },
  hipthrust: { part: 'Glutes', muscles: 'Glutes, hamstrings', gear: 'A bench' },
  rdl: { part: 'Glutes', muscles: 'Hamstrings, glutes', gear: 'Dumbbells' },
  onearmrow: { part: 'Back', muscles: 'Lats, biceps', gear: 'A dumbbell' },
  stepup: { part: 'Legs', muscles: 'Quads, glutes', gear: 'A step' },
  sideplank: { part: 'Core', muscles: 'Obliques', gear: 'Body weight' },
  legpress: { part: 'Legs', muscles: 'Quads, glutes', gear: 'Machine' },
  chestpress: { part: 'Chest', muscles: 'Chest, triceps', gear: 'Machine' },
  pulldown: { part: 'Back', muscles: 'Lats, biceps', gear: 'Cable machine' },
  cablerow: { part: 'Back', muscles: 'Upper back, biceps', gear: 'Cable machine' },
  shoulderpress: { part: 'Shoulders', muscles: 'Shoulders, triceps', gear: 'Machine' },
  legcurl: { part: 'Legs', muscles: 'Hamstrings', gear: 'Machine' },
  pallof: { part: 'Core', muscles: 'Abs, obliques', gear: 'Cable machine' },
  plank: { part: 'Core', muscles: 'Abs', gear: 'Body weight' },
};

// When a machine or a bench is taken, these stand in for an exercise that is counted in reps. Sets, reps and rest stay as planned.
export const SWAPS = {
  sitstand: ['goblet', 'stepup'], wallpush: ['inclinepush', 'bprow'], bridge: ['hipthrust', 'rdl'], bprow: ['onearmrow', 'cablerow'],
  goblet: ['legpress', 'stepup'], inclinepush: ['chestpress', 'wallpush'], splitsquat: ['stepup', 'goblet'], deadbug: ['pallof'],
  hipthrust: ['bridge', 'rdl'], rdl: ['hipthrust', 'legcurl'], onearmrow: ['cablerow', 'pulldown'], stepup: ['splitsquat', 'legpress'],
  legpress: ['goblet', 'stepup'], chestpress: ['inclinepush', 'shoulderpress'], pulldown: ['cablerow', 'onearmrow'],
  cablerow: ['pulldown', 'onearmrow'], shoulderpress: ['chestpress', 'inclinepush'], legcurl: ['rdl', 'bridge'], pallof: ['deadbug'],
};

export const PROGRESSION = 'When every set reaches the top of the rep range with 2 reps still in the tank, add a little weight next time: a book in the backpack, or the next step on the machine.';
export const DELOAD = 'Easier week: about a third less cardio and one set fewer, so your body catches up. Plan one every fourth week from week 16.';
export const HOT = 'Hot season. Train indoors, or outdoors before 08:00 or after 19:00, and drink 500 ml before you start.';
export const HOT_LONGWALK = 'In the heat: walk the same time on an incline treadmill instead, but keep one early-morning outdoor walk a week so the Watch still updates your VO2max.';

// Weekdays run Monday (index 0) to Sunday (index 6).
// A day entry is { s: session id, min: minutes or [minutes per week of the block], reps: interval repeats }.
export const BLOCKS = [
  {
    name: 'Walking base', weeks: [1, 4], targets: { exMin: 100, steps: 7500, strength: 1 },
    intro: 'Build the walking habit: short walks every weekday, one longer walk and one short strength session.',
    days: [
      [{ s: 'walks' }], [{ s: 'walks' }], [{ s: 'walks' }, { s: 'strHome' }], [{ s: 'walks' }], [{ s: 'walks' }],
      [{ s: 'longwalk', min: [30, 35, 40, 45] }], [{ s: 'rest' }],
    ],
  },
  {
    name: 'Add cardio', weeks: [5, 8], targets: { exMin: 150, steps: 8000, strength: 2 },
    intro: 'Keep the walks and add two cardio sessions and a second strength day.',
    days: [
      [{ s: 'walks' }], [{ s: 'walks' }, { s: 'cardio', min: 30 }], [{ s: 'walks' }, { s: 'strA' }], [{ s: 'walks' }, { s: 'cardio', min: 30 }],
      [{ s: 'walks' }], [{ s: 'strB' }], [{ s: 'longwalk', min: 45 }],
    ],
  },
  {
    name: 'Build', weeks: [9, 12], targets: { exMin: 200, steps: 8000, strength: 2 },
    intro: 'Three cardio sessions, one of them intervals, and strength on gym machines if you can.',
    days: [
      [{ s: 'walks' }, { s: 'cardio', min: 40 }], [{ s: 'walks' }, { s: 'gymA' }], [{ s: 'walks' }, { s: 'intervals', min: 35, reps: 5 }],
      [{ s: 'walks' }], [{ s: 'walks' }, { s: 'cardio', min: 40 }], [{ s: 'gymB' }], [{ s: 'longwalk', min: 60 }],
    ],
  },
  {
    name: 'Build to 250', weeks: [13, 24], targets: { exMin: 250, steps: 8500, strength: 2 },
    intro: 'Longer cardio and a sixth interval, with an easier week every fourth week. Train indoors in the hot months and keep the post-meal walks.',
    days: [
      [{ s: 'walks' }, { s: 'cardio', min: 45 }], [{ s: 'walks' }, { s: 'gymA' }], [{ s: 'walks' }, { s: 'intervals', min: 40, reps: 6 }],
      [{ s: 'walks' }], [{ s: 'walks' }, { s: 'cardio', min: 50 }], [{ s: 'gymB' }], [{ s: 'longwalk', min: 60 }],
    ],
  },
  {
    name: 'Keep it going', weeks: [25, null], targets: { exMin: 250, steps: 9000, strength: 2 },
    intro: 'The long-term week: eight intervals, a 75-minute walk, and an easier week every fourth week. From here, progress comes from adding weight in the gym.',
    days: [
      [{ s: 'walks' }, { s: 'cardio', min: 50 }], [{ s: 'walks' }, { s: 'gymA' }], [{ s: 'walks' }, { s: 'intervals', min: 45, reps: 8 }],
      [{ s: 'walks' }], [{ s: 'walks' }, { s: 'cardio', min: 50 }], [{ s: 'gymB' }], [{ s: 'longwalk', min: 75 }],
    ],
  },
];

// Calendar weeks since the plan start that hold the 3-, 6- and 12-month milestones (days 84, 182 and 364).
export const CHECKINS = {
  13: 'Check-in week: weigh in, measure your waist, note your VO2max from the Health app, and have the 3-month blood test done.',
  27: 'Six-month check-in: weigh in, measure your waist and note your VO2max. Compare with the start in Progress.',
  53: 'One-year check-in: time for the annual checkup. Ask for HbA1c to be included.',
};

// ---- Shopping items. unit g, ml or pcs; step rounds up; pack converts grams to cans. ----
export const GROUPS = [['protein', 'Protein and dairy'], ['grains', 'Grains and beans'], ['veg', 'Vegetables and fruit'], ['pantry', 'Pantry']];
export const ITEMS = {
  chickenbreast: { name: 'Chicken breast', group: 'protein', unit: 'g', step: 50 },
  chickenthigh: { name: 'Skinless chicken thighs', group: 'protein', unit: 'g', step: 50 },
  chickenmince: { name: 'Chicken mince', group: 'protein', unit: 'g', step: 50 },
  whitefish: { name: 'White fish (barramundi or tilapia)', group: 'protein', unit: 'g', step: 50 },
  salmon: { name: 'Salmon fillet', group: 'protein', unit: 'g', step: 50 },
  saba: { name: 'Saba (mackerel) fillets', group: 'protein', unit: 'pcs' },
  tuna: { name: 'Tuna in water, cans', group: 'protein', unit: 'pcs' },
  tofu: { name: 'Firm tofu', group: 'protein', unit: 'g', step: 100 },
  eggs: { name: 'Eggs', group: 'protein', unit: 'pcs' },
  eggwhite: { name: 'Liquid egg white (or extra eggs, whites only)', group: 'protein', unit: 'g', step: 50 },
  greekyog: { name: 'Low-fat Greek yogurt', group: 'protein', unit: 'g', step: 100 },
  milk: { name: 'Low-fat milk', group: 'protein', unit: 'ml', step: 500 },
  whey: { name: 'Whey protein', group: 'protein', unit: 'g', step: 30 },
  feta: { name: 'Feta', group: 'protein', unit: 'g', step: 50 },
  brownrice: { name: 'Brown rice (dry)', group: 'grains', unit: 'g', step: 50 },
  oats: { name: 'Rolled oats', group: 'grains', unit: 'g', step: 50 },
  bread: { name: 'Wholegrain bread, slices', group: 'grains', unit: 'pcs' },
  pita: { name: 'Wholegrain pita', group: 'grains', unit: 'pcs' },
  couscous: { name: 'Wholewheat couscous (dry)', group: 'grains', unit: 'g', step: 50 },
  frik: { name: 'Frik or bulgur (dry)', group: 'grains', unit: 'g', step: 50 },
  redlentils: { name: 'Red lentils', group: 'grains', unit: 'g', step: 50 },
  whitebeans: { name: 'White beans', group: 'grains', unit: 'g', pack: 240, packName: 'can' },
  chickpeas: { name: 'Chickpeas', group: 'grains', unit: 'g', pack: 240, packName: 'can' },
  potato: { name: 'Potatoes', group: 'veg', unit: 'g', step: 100 },
  sweetpotato: { name: 'Sweet potato', group: 'veg', unit: 'g', step: 100 },
  tomatoes: { name: 'Tomatoes', group: 'veg', unit: 'g', step: 100 },
  choptom: { name: 'Chopped tomatoes', group: 'veg', unit: 'g', pack: 400, packName: 'can' },
  peppers: { name: 'Peppers', group: 'veg', unit: 'pcs' },
  onion: { name: 'Onions', group: 'veg', unit: 'pcs' },
  garlic: { name: 'Garlic cloves', group: 'veg', unit: 'pcs' },
  carrot: { name: 'Carrots', group: 'veg', unit: 'pcs' },
  zucchini: { name: 'Zucchini', group: 'veg', unit: 'pcs' },
  mixedveg: { name: 'Mixed vegetables for roasting (pumpkin, zucchini, peppers, broccoli, onion)', group: 'veg', unit: 'g', step: 100 },
  greens: { name: 'Leafy greens (morning glory, pak choi or spinach)', group: 'veg', unit: 'g', step: 100 },
  broccoli: { name: 'Broccoli', group: 'veg', unit: 'g', step: 100 },
  salad: { name: 'Salad leaves or cabbage', group: 'veg', unit: 'g', step: 100 },
  cucumber: { name: 'Cucumbers', group: 'veg', unit: 'pcs' },
  edamame: { name: 'Frozen edamame (shelled)', group: 'veg', unit: 'g', step: 100 },
  berries: { name: 'Frozen berries', group: 'veg', unit: 'g', step: 100 },
  apple: { name: 'Apples', group: 'veg', unit: 'pcs' },
  banana: { name: 'Bananas', group: 'veg', unit: 'pcs' },
  guava: { name: 'Guavas', group: 'veg', unit: 'pcs' },
  orange: { name: 'Oranges', group: 'veg', unit: 'pcs' },
  lemon: { name: 'Lemons or limes', group: 'veg', unit: 'pcs' },
  almonds: { name: 'Almonds', group: 'pantry', unit: 'g', step: 50 },
  walnuts: { name: 'Walnuts', group: 'pantry', unit: 'g', step: 50 },
  chia: { name: 'Chia seeds', group: 'pantry', unit: 'g', step: 50 },
  hummus: { name: 'Hummus', group: 'pantry', unit: 'g', step: 100 },
  oliveoil: { name: 'Olive oil', group: 'pantry', unit: 'ml', step: 50 },
  stock: { name: 'Low-salt stock cubes', group: 'pantry', unit: 'pcs' },
};
export const PANTRY = ['Cumin, paprika and ras el hanout', 'Salt and black pepper', 'Low-salt oyster or soy sauce', 'Chili, garlic and fresh herbs (mint, parsley, coriander)'];

// ---- Batch cooking. buy = shopping items per unit (cooked gram or portion). how(q) = the prep step. ----
const up = (v, s) => Math.ceil(v / s - 1e-9) * s;
const mass = (g) => (g >= 1000 ? `${String(Math.round(g / 100) / 10)} kg` : `${g} g`);
const tbsp = (ml) => `${Math.max(1, Math.round(ml / 7.5) / 2)} tbsp`;
const whole = (n) => Math.max(1, Math.ceil(n - 1e-9));
const litres = (l) => `${Math.ceil(l * 4 - 1e-9) / 4} L`;

export const BATCHES = {
  chicken: {
    name: 'Cooked chicken breast', unit: 'g', buy: { chickenbreast: 1.35 },
    how: (g) => `Chicken: season ${mass(up(g * 1.35, 50))} raw chicken breast with salt, pepper, paprika, garlic and lemon. Air fryer 180°C for 18 to 22 minutes, oven 200°C for 20 to 25, or a pan for 6 to 7 minutes a side, until the juices run clear. That gives about ${mass(up(g, 10))} cooked. Slice once cool.`,
  },
  rice: {
    name: 'Cooked brown rice', unit: 'g', buy: { brownrice: 0.34 },
    how: (g) => `Rice: cook ${up(g * 0.34, 25)} g dry brown rice (rice cooker brown setting, or 1 part rice to 2 parts water for 40 minutes), about ${mass(up(g, 10))} cooked. Spread it out to cool and get it in the fridge within an hour.`,
  },
  roastveg: {
    name: 'Roast vegetables', unit: 'g', buy: { mixedveg: 1.15, oliveoil: 0.02 },
    how: (g) => `Roast vegetables: ${mass(up(g * 1.15, 100))} of pumpkin, zucchini, peppers, onion and broccoli with ${tbsp(g * 0.02)} olive oil, in the air fryer or oven at 200 to 220°C for 20 to 25 minutes.`,
  },
  yogsauce: {
    name: 'Yogurt herb sauce', unit: 'g', buy: { greekyog: 1, garlic: 0.005, lemon: 0.004 },
    how: (g) => `Yogurt herb sauce: ${up(g, 50)} g low-fat Greek yogurt with a grated garlic clove, lemon juice, mint and parsley.`,
  },
  chorba: {
    name: 'Lentil chorba', unit: 'portion', buy: { redlentils: 62, choptom: 100, onion: 0.25, carrot: 0.5, oliveoil: 7.5, stock: 0.75 },
    how: (n) => `Lentil chorba, ${n} ${n > 1 ? 'portions' : 'portion'}: soften ${whole(n * 0.25)} onion and ${whole(n * 0.5)} ${whole(n * 0.5) > 1 ? 'carrots' : 'carrot'} in ${tbsp(n * 7.5)} olive oil, add 1 tsp each of cumin and paprika, ${up(n * 62, 10)} g red lentils, ${up(n * 100, 50)} g chopped tomatoes and ${litres(n * 0.375)} low-salt stock. Simmer 25 minutes.`,
  },
  chakchouka: {
    name: 'Chakchouka base', unit: 'portion', buy: { peppers: 1, tomatoes: 200, onion: 0.5, garlic: 0.75, oliveoil: 7.5 },
    how: (n) => `Chakchouka base, ${n} × 250 g: soften ${whole(n * 0.5)} ${whole(n * 0.5) > 1 ? 'onions' : 'onion'}, ${n} ${n > 1 ? 'peppers' : 'pepper'} and ${whole(n * 0.75)} garlic cloves in ${tbsp(n * 7.5)} olive oil, add ${up(n * 200, 50)} g tomatoes, paprika and cumin, and simmer 20 minutes.`,
  },
  loubia: {
    name: 'Loubia', unit: 'portion', buy: { whitebeans: 240, choptom: 133, onion: 0.34, garlic: 0.67, oliveoil: 10 },
    how: (n) => `Loubia, ${n} ${n > 1 ? 'portions' : 'portion'}: soften ${whole(n * 0.34)} onion and ${whole(n * 0.67)} garlic cloves in ${tbsp(n * 10)} olive oil, add ${n} drained ${n > 1 ? 'cans' : 'can'} of white beans, ${up(n * 133, 50)} g chopped tomatoes, cumin, paprika and a splash of water. Simmer 15 minutes.`,
  },
  traybake: {
    name: 'Chicken thigh tray bake', unit: 'portion', buy: { chickenthigh: 250, mixedveg: 300, potato: 150, oliveoil: 15, lemon: 0.25 },
    how: (n) => `Tray bake, ${n} ${n > 1 ? 'portions' : 'portion'}: ${mass(up(n * 250, 50))} skinless chicken thighs, ${mass(up(n * 300, 100))} peppers, onion, zucchini and pumpkin, and ${mass(up(n * 150, 50))} potato in chunks, with ${tbsp(n * 15)} olive oil, paprika, garlic and lemon. 200°C for 30 to 35 minutes.`,
  },
  oats: {
    name: 'Overnight oats', unit: 'portion', buy: { oats: 50, milk: 200, whey: 30, chia: 10, berries: 100 },
    how: (n) => `Overnight oats: ${n} ${n > 1 ? 'jars' : 'jar'}, each with 50 g oats, 200 ml low-fat milk, 1 scoop whey, 10 g chia and 100 g berries. They keep 3 days.`,
  },
  frik: {
    name: 'Chorba frik', unit: 'portion', buy: { frik: 50, chickenbreast: 135, chickpeas: 40, tomatoes: 100, onion: 0.5, carrot: 0.5, oliveoil: 7.5, stock: 0.75 },
    how: (n) => `Chorba frik, ${n} ${n > 1 ? 'portions' : 'portion'}: brown ${mass(up(n * 135, 50))} diced chicken breast in ${tbsp(n * 7.5)} olive oil with ${whole(n * 0.5)} onion and ${whole(n * 0.5)} ${whole(n * 0.5) > 1 ? 'carrots' : 'carrot'}, add ${up(n * 100, 50)} g tomatoes, ras el hanout, ${up(n * 50, 10)} g frik or bulgur, ${up(n * 40, 10)} g chickpeas and ${litres(n * 0.375)} low-salt stock. Simmer 30 minutes and finish with coriander.`,
  },
  tagine: {
    name: 'Chicken and chickpea tagine', unit: 'portion', buy: { chickenthigh: 200, chickpeas: 80, zucchini: 0.5, carrot: 1, onion: 0.5, tomatoes: 100, oliveoil: 10 },
    how: (n) => `Tagine, ${n} ${n > 1 ? 'portions' : 'portion'}: brown ${mass(up(n * 200, 50))} chicken thighs in ${tbsp(n * 10)} olive oil, add ${whole(n * 0.5)} onion, ${n} ${n > 1 ? 'carrots' : 'carrot'}, ${whole(n * 0.5)} zucchini, ${up(n * 100, 50)} g tomatoes, ${up(n * 80, 10)} g chickpeas, ras el hanout and a cup of water. Simmer 35 minutes with a lid on.`,
  },
};
export const BATCH_ORDER = ['rice', 'chicken', 'roastveg', 'chorba', 'frik', 'chakchouka', 'loubia', 'traybake', 'tagine', 'yogsauce', 'oats'];

// slot: breakfast, lunch, dinner, snack or extra. where: home (cook on the day), prep (from a batch), out (order).
// buy: shopping items per portion that are not part of a batch. batches: [batch id, amount per portion].
// tags: sugary (a sugary drink) or purine (red meat, offal or shellfish).
export const MEALS = [
  { id: 'oats', name: 'Overnight oats with whey', slot: 'breakfast', kcal: 500, p: 40, fib: 11, where: 'prep', batches: [['oats', 1]],
    ing: ['50 g rolled oats', '200 ml low-fat milk', '1 scoop whey protein (30 g)', '10 g chia seeds', '100 g berries (frozen is fine)'],
    steps: ['Mix everything in a jar the night before.', 'Keep in the fridge, eat cold. Keeps 3 days.'] },
  { id: 'yogbowl', name: 'Greek yogurt oat bowl', slot: 'breakfast', kcal: 460, p: 33, fib: 8, where: 'home', buy: { greekyog: 250, oats: 40, berries: 100, walnuts: 15 },
    ing: ['250 g low-fat Greek yogurt', '40 g rolled oats', '100 g berries or 1 small banana', '15 g walnuts'],
    steps: ['Layer in a bowl. No sugar or honey needed with the fruit.'] },
  { id: 'eggtoast', name: 'Eggs, whites and wholegrain toast', slot: 'breakfast', kcal: 535, p: 33, fib: 11, where: 'home', buy: { eggs: 2, eggwhite: 100, bread: 2, tomatoes: 100, cucumber: 0.5, apple: 1, oliveoil: 5 },
    ing: ['2 eggs plus 3 egg whites', '2 slices wholegrain bread', '1 tsp olive oil', 'Tomato and cucumber', '1 apple'],
    steps: ['Scramble the eggs and whites in the oil over medium heat.', 'Serve on the toast with the vegetables, apple on the side.'] },
  { id: 'chakchouka', name: 'Chakchouka with eggs', slot: 'breakfast', kcal: 525, p: 34, fib: 9, where: 'prep', batches: [['chakchouka', 1]], buy: { eggs: 2, eggwhite: 100, bread: 2 },
    ing: ['250 g chakchouka base (from prep)', '2 eggs plus 3 egg whites', '2 slices wholegrain bread'],
    steps: ['Heat the base in a small pan until it bubbles.', 'Make two wells, crack in the eggs, pour the whites around, cover for 5 to 6 minutes.'] },
  { id: 'tofuscramble', name: 'Tofu scramble on toast', slot: 'breakfast', kcal: 550, p: 38, fib: 10, where: 'home', buy: { tofu: 200, greens: 50, bread: 2, orange: 1, oliveoil: 5 },
    ing: ['200 g firm tofu', 'A handful of spinach or greens', '1 tsp oil, turmeric, cumin, black pepper', '2 slices wholegrain bread', '1 orange'],
    steps: ['Crumble the tofu into the hot oil with the spices, cook 5 minutes.', 'Stir in the greens until they wilt and serve on the toast.'] },
  { id: 'pancakes', name: 'Oat and banana protein pancakes', slot: 'breakfast', kcal: 580, p: 40, fib: 9, where: 'home', buy: { oats: 50, banana: 1, eggs: 1, eggwhite: 100, oliveoil: 5, greekyog: 150, berries: 50 },
    ing: ['50 g oats', '1 banana', '1 egg plus 3 egg whites', '1 tsp oil', '150 g low-fat Greek yogurt and 50 g berries on top'],
    steps: ['Blend the oats, banana, egg and whites.', 'Cook small pancakes in the oiled pan, 2 minutes a side.', 'Top with the yogurt and berries. No syrup.'] },
  { id: 'khaotom', name: 'Khao tom gai with egg (eating out)', slot: 'breakfast', kcal: 400, p: 30, fib: 1, where: 'out',
    ing: ['Rice soup with chicken and an egg'],
    steps: ['Ask for no fried garlic oil on top. Add the chili and lime instead of sugar.'] },

  { id: 'chxbowl', name: 'Chicken, brown rice and roast vegetable bowl', slot: 'lunch', kcal: 660, p: 51, fib: 8, where: 'prep', batches: [['chicken', 120], ['rice', 180], ['roastveg', 200], ['yogsauce', 60]],
    ing: ['120 g cooked chicken breast', '180 g cooked brown rice', '200 g roast vegetables', '60 g yogurt herb sauce'],
    steps: ['Pack in a lunch box from the prep.', 'Microwave until steaming hot all the way through. Add the sauce after heating.'] },
  { id: 'chorba', name: 'Lentil chorba with chicken and bread', slot: 'lunch', kcal: 670, p: 49, fib: 16, where: 'prep', batches: [['chorba', 1], ['chicken', 80]], buy: { bread: 2, lemon: 0.25 },
    ing: ['1 bowl lentil chorba (from prep)', '80 g cooked chicken', '2 slices wholegrain bread'],
    steps: ['Reheat a portion until boiling.', 'Stir in the chicken, add lemon and coriander.'] },
  { id: 'frik', name: 'Chorba frik with chicken', slot: 'lunch', kcal: 610, p: 47, fib: 15, where: 'prep', batches: [['frik', 1]], buy: { bread: 1 },
    ing: ['1 bowl chorba frik (from prep): chicken, frik or bulgur, chickpeas and tomato', '1 slice wholegrain bread'],
    steps: ['Reheat until boiling, add lemon and fresh coriander.'] },
  { id: 'tunasalad', name: 'Tuna, white bean and vegetable salad', slot: 'lunch', kcal: 580, p: 48, fib: 15, where: 'home', buy: { tuna: 1, whitebeans: 150, tomatoes: 100, cucumber: 0.5, peppers: 0.5, onion: 0.25, oliveoil: 15, bread: 1, lemon: 0.5 },
    ing: ['1 can tuna in water, drained', '150 g drained white beans', 'Tomato, cucumber, pepper and a little red onion', '1 tbsp olive oil and lemon juice', 'Parsley', '1 slice wholegrain bread'],
    steps: ['Chop the vegetables, mix everything, season with the oil, lemon and pepper. 10 minutes.'] },
  { id: 'salmon', name: 'Salmon, sweet potato and broccoli', slot: 'lunch', kcal: 590, p: 37, fib: 13, where: 'home', buy: { salmon: 130, sweetpotato: 250, broccoli: 150, oliveoil: 5 },
    ing: ['130 g salmon fillet', '250 g sweet potato', '150 g broccoli', '1 tsp olive oil'],
    steps: ['Air fryer 180°C: sweet potato cubes 15 minutes, then add the salmon and broccoli for 10 more.'] },
  { id: 'gaiyang', name: 'Gai yang, som tam and sticky rice (eating out)', slot: 'lunch', kcal: 550, p: 40, fib: 4, where: 'out',
    ing: ['Grilled chicken, skin off', 'Papaya salad, no sugar, no salted crab', 'A small portion of sticky rice (about a fist)'],
    steps: ['Order the som tam mai wan.', 'Leave the skin and the second bag of rice.'] },
  { id: 'krapao', name: 'Kra pao gai, less rice, less oil (eating out)', slot: 'lunch', kcal: 580, p: 38, fib: 2, where: 'out',
    ing: ['Stir-fried chicken with holy basil', 'Half the usual rice'],
    steps: ['Ask for khao noi, nam man noi.', 'A fried egg on top adds about 100 kcal.'] },
  { id: 'larb', name: 'Larb gai with vegetables and sticky rice (eating out)', slot: 'lunch', kcal: 450, p: 37, fib: 4, where: 'out',
    ing: ['Minced chicken salad with herbs and toasted rice', 'Raw cabbage, long beans and cucumber', 'A small portion of sticky rice'],
    steps: ['Ask for chicken only, no offal.'] },
  { id: 'tomyum', name: 'Clear tom yum gai, rice and morning glory (eating out)', slot: 'lunch', kcal: 510, p: 44, fib: 4, where: 'out',
    ing: ['Clear tom yum with chicken (nam sai, not the creamy one)', 'Half a plate of rice', 'Stir-fried morning glory, less oil'],
    steps: ['Ask for nam sai and nam man noi.'] },

  { id: 'fishstir', name: 'Fish, tofu and vegetable stir-fry', slot: 'dinner', kcal: 670, p: 53, fib: 9, where: 'home', batches: [['rice', 150]], buy: { whitefish: 120, tofu: 100, mixedveg: 250, oliveoil: 10 },
    ing: ['120 g white fish (barramundi or tilapia)', '100 g firm tofu', '250 g mixed vegetables', '2 tsp oil', '1 tbsp oyster or soy sauce', '150 g cooked brown rice (from prep)'],
    steps: ['Pan-fry the fish and tofu in half the oil, 3 minutes a side, set aside.', 'Stir-fry the vegetables in the rest for 4 minutes, add the sauce, return the fish and tofu.', 'Serve with the rice. About 20 minutes.'] },
  { id: 'planeung', name: 'Steamed fish with lime, rice and greens', slot: 'dinner', kcal: 520, p: 48, fib: 6, where: 'home', batches: [['rice', 150]], buy: { whitefish: 150, lemon: 1, garlic: 2, greens: 200, oliveoil: 10 },
    ing: ['150 g white fish fillet', 'Lime juice, garlic, chili and a little fish sauce', '150 g cooked brown rice (from prep)', '200 g greens stir-fried in 2 tsp oil'],
    steps: ['Steam the fish for 8 to 10 minutes (or microwave, covered, 4 minutes).', 'Pour over the lime, garlic and chili sauce.', 'Stir-fry the greens and serve with the rice.'] },
  { id: 'saba', name: 'Grilled saba, rice, edamame and greens', slot: 'dinner', kcal: 620, p: 46, fib: 9, where: 'home', batches: [['rice', 120]], buy: { saba: 1, edamame: 100, cucumber: 0.5 },
    ing: ['1 saba (mackerel) fillet, about 120 g', '120 g cooked rice', '100 g shelled edamame', 'Cucumber and greens'],
    steps: ['Air fryer 200°C for 8 to 10 minutes, skin side up, or a dry pan.', 'Microwave the edamame for 3 minutes.'] },
  { id: 'loubia', name: 'Loubia (white bean stew) with chicken', slot: 'dinner', kcal: 650, p: 49, fib: 18, where: 'prep', batches: [['loubia', 1], ['chicken', 80]], buy: { salad: 80, bread: 1 },
    ing: ['1 portion loubia from prep (about 240 g beans in tomato sauce)', '80 g cooked chicken', 'Side salad', '1 slice wholegrain bread'],
    steps: ['Reheat the beans until bubbling, add the chicken for the last 2 minutes.'] },
  { id: 'couscous', name: 'Wholewheat couscous with vegetables and chicken', slot: 'dinner', kcal: 705, p: 53, fib: 15, where: 'home', batches: [['chicken', 120]], buy: { couscous: 70, zucchini: 0.5, carrot: 1, onion: 0.5, chickpeas: 60, oliveoil: 10, stock: 1 },
    ing: ['70 g dry wholewheat couscous', '120 g cooked chicken (from prep)', '250 g zucchini, carrot and onion', '60 g chickpeas', '2 tsp olive oil', 'Ras el hanout, cumin, low-salt stock'],
    steps: ['Simmer the vegetables in 400 ml stock with the spices for 20 minutes, add the chicken for the last 5.', 'Pour boiling water over the couscous to just cover, lid on for 5 minutes, fluff with a fork.', 'Serve the stew over the couscous.'] },
  { id: 'tagine', name: 'Chicken and chickpea tagine with couscous', slot: 'dinner', kcal: 720, p: 49, fib: 15, where: 'prep', batches: [['tagine', 1]], buy: { couscous: 50 },
    ing: ['1 portion tagine from prep (chicken thigh, chickpeas, vegetables)', '50 g dry wholewheat couscous'],
    steps: ['Reheat the tagine until bubbling.', 'Pour boiling water over the couscous to just cover, lid on for 5 minutes.'] },
  { id: 'traybake', name: 'Chicken thigh and vegetable tray bake', slot: 'dinner', kcal: 660, p: 45, fib: 12, where: 'prep', batches: [['traybake', 1]],
    ing: ['150 g skinless chicken thigh (cooked weight)', '300 g peppers, onion, zucchini and pumpkin', '150 g potato', '1 tbsp olive oil', 'Paprika, garlic, lemon'],
    steps: ['From the prep. Reheat until steaming hot.'] },
  { id: 'kefta', name: 'Chicken kefta, salad, hummus and pita', slot: 'dinner', kcal: 580, p: 52, fib: 10, where: 'home', buy: { chickenmince: 200, onion: 0.25, pita: 1, hummus: 50, salad: 150, oliveoil: 5, greekyog: 50 },
    ing: ['200 g chicken mince with grated onion, parsley and cumin', '1 wholegrain pita', '50 g hummus', 'Large salad with 1 tsp olive oil', '50 g yogurt sauce'],
    steps: ['Shape the mince into 6 small sausages.', 'Air fryer 200°C for 10 to 12 minutes, or a pan.', 'Serve with the salad, hummus, yogurt and pita.'] },
  { id: 'omelette', name: 'Big omelette and salad', slot: 'dinner', kcal: 530, p: 39, fib: 8, where: 'home', buy: { eggs: 2, eggwhite: 130, mixedveg: 150, feta: 30, salad: 100, bread: 1, oliveoil: 10 },
    ing: ['2 eggs plus 4 egg whites', '150 g vegetables (onion, pepper, spinach)', '30 g feta', '1 tsp oil plus 1 tsp olive oil on the salad', 'Large side salad', '1 slice wholegrain bread'],
    steps: ['Soften the vegetables in the oil, pour in the eggs, crumble the feta on top, finish under a lid. 10 minutes.'] },

  { id: 'yogfruit', name: 'Greek yogurt with fruit', slot: 'snack', kcal: 190, p: 21, fib: 3, where: 'home', buy: { greekyog: 200, berries: 100 }, ing: ['200 g low-fat Greek yogurt', '100 g fruit'], steps: [] },
  { id: 'applenuts', name: 'Apple and almonds', slot: 'snack', kcal: 210, p: 5, fib: 7, where: 'home', buy: { apple: 1, almonds: 20 }, ing: ['1 apple', '20 g almonds (about 15)'], steps: [] },
  { id: 'edamame', name: 'Edamame', slot: 'snack', kcal: 145, p: 14, fib: 6, where: 'home', buy: { edamame: 120 }, ing: ['120 g shelled edamame'], steps: [] },
  { id: 'milk', name: 'Glass of low-fat milk', slot: 'snack', kcal: 140, p: 10, fib: 0, where: 'home', buy: { milk: 300 }, ing: ['300 ml low-fat milk'], steps: [] },
  { id: 'shake', name: 'Whey shake with milk', slot: 'snack', kcal: 235, p: 32, fib: 0, where: 'home', buy: { whey: 30, milk: 250 }, ing: ['1 scoop whey (30 g)', '250 ml low-fat milk'], steps: [] },
  { id: 'hummus', name: 'Hummus and vegetable sticks', slot: 'snack', kcal: 165, p: 7, fib: 7, where: 'home', buy: { hummus: 80, carrot: 1, cucumber: 0.5 }, ing: ['80 g hummus', 'Carrot and cucumber sticks'], steps: [] },
  { id: 'eggs2', name: 'Two boiled eggs', slot: 'snack', kcal: 145, p: 13, fib: 0, where: 'home', buy: { eggs: 2 }, ing: ['2 eggs'], steps: [] },
  { id: 'guava', name: 'Guava', slot: 'snack', kcal: 100, p: 4, fib: 8, where: 'home', buy: { guava: 1 }, ing: ['1 small guava (about 150 g)'], steps: [] },
  { id: 'banana', name: 'Banana', slot: 'snack', kcal: 105, p: 1, fib: 3, where: 'home', buy: { banana: 1 }, ing: ['1 medium banana'], steps: [] },
  { id: 'coffee', name: 'Coffee with milk, no sugar', slot: 'snack', kcal: 50, p: 3, fib: 0, where: 'home', buy: { milk: 100 }, ing: ['Coffee with 100 ml low-fat milk'], steps: [] },

  // Extras. Thai dishes and drinks: one typical plate, bowl or cup, from the Thai Department of Health food tables (2008, 2018), INMU Thai FCD (2025) and a Bangkok delivery-food lab study (IJERPH 2023).
  { id: 'thaitea', name: 'Thai iced tea (cha yen)', slot: 'extra', kcal: 260, p: 3, fib: 0, where: 'out', tags: ['sugary'], ing: [], steps: [] },
  { id: 'sweetcoffee', name: 'Thai iced coffee with milk (kafae yen)', slot: 'extra', kcal: 300, p: 3, fib: 0, where: 'out', tags: ['sugary'], ing: [], steps: [] },
  { id: 'bubbletea', name: 'Bubble milk tea', slot: 'extra', kcal: 380, p: 3, fib: 0, where: 'out', tags: ['sugary'], ing: [], steps: [] },
  { id: 'softdrink', name: 'Soft drink, can', slot: 'extra', kcal: 140, p: 0, fib: 0, where: 'out', tags: ['sugary'], ing: [], steps: [] },
  { id: 'juice', name: 'Fruit juice, glass', slot: 'extra', kcal: 120, p: 1, fib: 0, where: 'out', tags: ['sugary'], ing: [], steps: [] },
  { id: 'redmeat', name: 'Red meat dish (beef, lamb or pork)', slot: 'extra', kcal: 600, p: 35, fib: 2, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'seafood', name: 'Shrimp or shellfish dish', slot: 'extra', kcal: 500, p: 30, fib: 2, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'offal', name: 'Offal dish (liver, intestines)', slot: 'extra', kcal: 450, p: 30, fib: 1, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'khaopad', name: 'Fried rice with chicken (khao pad gai)', slot: 'extra', kcal: 620, p: 21, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'khaopadgoong', name: 'Fried rice with shrimp (khao pad goong)', slot: 'extra', kcal: 580, p: 20, fib: 3, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'khaomangai', name: 'Khao man gai (chicken rice)', slot: 'extra', kcal: 570, p: 19, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'greencurry', name: 'Green curry with chicken and rice', slot: 'extra', kcal: 500, p: 18, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'massaman', name: 'Massaman curry with chicken and rice', slot: 'extra', kcal: 550, p: 18, fib: 4, where: 'out', ing: [], steps: [] },
  { id: 'padthai', name: 'Pad thai with chicken', slot: 'extra', kcal: 560, p: 22, fib: 5, where: 'out', ing: [], steps: [] },
  { id: 'padthaigoong', name: 'Pad thai with shrimp (goong)', slot: 'extra', kcal: 550, p: 21, fib: 5, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'padseeew', name: 'Pad see ew with chicken (soy sauce noodles)', slot: 'extra', kcal: 650, p: 20, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'radna', name: 'Rad na with chicken (noodles in gravy)', slot: 'extra', kcal: 480, p: 15, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'khaosoi', name: 'Khao soi gai (curry noodle soup)', slot: 'extra', kcal: 620, p: 24, fib: 6, where: 'out', ing: [], steps: [] },
  { id: 'noodlesoup', name: 'Chicken noodle soup (kuay tiew gai)', slot: 'extra', kcal: 420, p: 30, fib: 2, where: 'out', ing: [], steps: [] },
  { id: 'boatnoodles', name: 'Beef boat noodles (kuay tiew reua), regular bowl', slot: 'extra', kcal: 420, p: 24, fib: 2, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'gaitod', name: 'Fried chicken with sticky rice (gai tod)', slot: 'extra', kcal: 600, p: 32, fib: 1, where: 'out', ing: [], steps: [] },
  { id: 'plapao', name: 'Salt-grilled fish (pla pao), per person, no rice', slot: 'extra', kcal: 230, p: 33, fib: 0, where: 'out', ing: [], steps: [] },
  { id: 'tomyumgoong', name: 'Creamy tom yum goong (nam khon) with rice', slot: 'extra', kcal: 550, p: 21, fib: 3, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'tomkhagai', name: 'Tom kha gai (coconut chicken soup) with rice', slot: 'extra', kcal: 550, p: 28, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'yamwoonsen', name: 'Yam woon sen (glass noodle salad) with seafood', slot: 'extra', kcal: 320, p: 18, fib: 3, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'hoytod', name: 'Oyster or mussel omelette (hoy tod)', slot: 'extra', kcal: 700, p: 20, fib: 1, where: 'out', tags: ['purine'], ing: [], steps: [] },
  { id: 'mango', name: 'Mango sticky rice', slot: 'extra', kcal: 550, p: 7, fib: 4, where: 'out', ing: [], steps: [] },
  { id: 'roti', name: 'Roti with condensed milk', slot: 'extra', kcal: 400, p: 7, fib: 1, where: 'out', ing: [], steps: [] },
  { id: 'pastry', name: 'Croissant or pastry', slot: 'extra', kcal: 300, p: 6, fib: 1, where: 'out', ing: [], steps: [] },
];

// Three weekly menus that rotate. Each day comes to about 2,100 to 2,300 kcal, which leaves room for extras.
const day = (breakfast, lunch, dinner, ...snack) => ({ breakfast, lunch, dinner, snack });
export const MENUS = [
  [
    day('oats', 'chxbowl', 'fishstir', 'guava', 'applenuts', 'coffee'),
    day('chakchouka', 'chxbowl', 'chorba', 'edamame', 'milk', 'coffee'),
    day('oats', 'chxbowl', 'saba', 'yogfruit', 'applenuts', 'coffee'),
    day('eggtoast', 'loubia', 'traybake', 'yogfruit', 'hummus', 'coffee'),
    day('oats', 'krapao', 'traybake', 'applenuts', 'milk', 'banana', 'coffee'),
    day('chakchouka', 'gaiyang', 'couscous', 'yogfruit', 'guava', 'banana', 'coffee'),
    day('eggtoast', 'chorba', 'omelette', 'applenuts', 'shake', 'coffee'),
  ],
  [
    day('tofuscramble', 'chxbowl', 'planeung', 'yogfruit', 'applenuts', 'coffee'),
    day('oats', 'frik', 'saba', 'hummus', 'milk', 'banana', 'coffee'),
    day('pancakes', 'chxbowl', 'tunasalad', 'applenuts', 'guava', 'coffee'),
    day('oats', 'frik', 'tagine', 'yogfruit', 'banana', 'coffee'),
    day('tofuscramble', 'tomyum', 'tagine', 'applenuts', 'milk', 'coffee'),
    day('pancakes', 'larb', 'kefta', 'yogfruit', 'edamame', 'banana', 'hummus', 'coffee'),
    day('eggtoast', 'salmon', 'omelette', 'applenuts', 'shake', 'coffee'),
  ],
  [
    day('chakchouka', 'chxbowl', 'fishstir', 'guava', 'applenuts', 'coffee'),
    day('yogbowl', 'tunasalad', 'loubia', 'applenuts', 'milk', 'banana', 'coffee'),
    day('oats', 'chxbowl', 'kefta', 'yogfruit', 'guava', 'banana', 'coffee'),
    day('tofuscramble', 'loubia', 'traybake', 'applenuts', 'coffee'),
    day('oats', 'gaiyang', 'traybake', 'yogfruit', 'guava', 'hummus', 'coffee'),
    day('pancakes', 'krapao', 'frik', 'edamame', 'banana', 'applenuts', 'coffee'),
    day('eggtoast', 'couscous', 'planeung', 'yogfruit', 'milk', 'coffee'),
  ],
];
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];
export const MENU_NOTE = 'Three weekly menus rotate. Swap any meal for a day from Today. Cheaper fish: saba, tilapia (pla nil) or barramundi (pla kapong).';

export const FOOD_SAFETY = [
  'Cooked chicken and rice keep 3 days in the fridge. Anything for a later day goes in the freezer, and the prep plan says which.',
  'Cool cooked rice fast and refrigerate it within an hour. Rice left warm is a common cause of food poisoning.',
  'Reheat until steaming hot all the way through, and reheat only once.',
  'Thaw frozen portions in the fridge overnight.',
];

export const EATING_OUT = {
  good: [
    'Gai yang (grilled chicken) with the skin off, som tam mai wan, a small portion of sticky rice',
    'Larb gai with raw vegetables, chicken only',
    'Clear tom yum gai (nam sai) with half a plate of rice',
    'Pla neung manao (steamed fish with lime and chili), rice and stir-fried greens',
    'Kra pao gai with khao noi and nam man noi',
    'Clear chicken noodle soup with extra vegetables, no sugar from the table caddy',
  ],
  sometimes: [
    'Coconut curries: green curry, massaman, khao soi (high in saturated fat)',
    'Fried rice, pad thai, khao man gai (around 550 to 650 kcal a plate)',
    'Shrimp, shellfish and offal dishes (raise uric acid)',
    'Mango sticky rice, Thai iced tea, bubble tea (sugar)',
  ],
  phrases: [
    ['ไม่หวาน', 'mai wan', 'not sweet'],
    ['หวานน้อย', 'wan noi', 'a little sweet'],
    ['ไม่ใส่น้ำตาล', 'mai sai nam tan', 'no sugar added'],
    ['ข้าวน้อย', 'khao noi', 'less rice'],
    ['น้ำมันน้อย', 'nam man noi', 'less oil'],
  ],
};

export const RULES = [
  'No sugary drinks, including juice and sweetened coffee or tea. Order drinks mai wan. Today counts them for the week.',
  'Fill half the plate with vegetables, a quarter with protein, a quarter with rice, noodles or bread.',
  'Eat the protein and vegetables first and the rice last. It lowers the blood sugar rise.',
  'Have protein at every meal and reach the daily target, and aim for 30 g of fibre.',
  'Drink to the water target. It goes up on training days.',
  'Keep red meat, offal, shellfish, sardines and anchovies to 2 servings a week or fewer. They raise uric acid and LDL.',
  'Cook with olive oil. Fried food, coconut-cream curries, butter and cheese are occasional.',
  'Lose about 0.5 to 0.75 kg a week. Crash diets and long fasts can set off gout.',
  'Walk for 10 minutes after lunch and after dinner.',
];

export const SAFETY = [
  'Stop and get medical help for chest pain or pressure, fainting, severe breathlessness, or a racing or irregular heartbeat that does not settle.',
  'Heat: dizziness, headache, nausea or confusion means stop, get somewhere cool and drink. In the hot months, train indoors or before 08:00 and after 19:00.',
  'Joint pain that lasts after a session: swap to the bike, rower or pool for a week.',
  'A sudden hot, swollen, very painful joint (often the big toe) needs a doctor within days.',
];

// ---- Health checks ----
export const LABS = [
  { key: 'fbs', name: 'Fasting glucose', unit: 'mg/dL', target: 'under 100', status: (v) => (v >= 126 ? 'high' : v >= 100 ? 'above target' : 'on target') },
  { key: 'a1c', name: 'HbA1c', unit: '%', target: 'under 5.7', status: (v) => (v >= 6.5 ? 'high' : v >= 5.7 ? 'above target' : 'on target') },
  { key: 'uric', name: 'Uric acid', unit: 'mg/dL', target: '7.0 or less', status: (v) => (v > 7.0 ? 'above target' : 'on target') },
  { key: 'ldl', name: 'LDL', unit: 'mg/dL', target: 'under 100', status: (v) => (v >= 160 ? 'high' : v >= 100 ? 'above target' : 'on target') },
  { key: 'hdl', name: 'HDL', unit: 'mg/dL', target: '55 or more (lab target; 40 is the usual low line for men)', status: (v) => (v < 40 ? 'low' : v < 55 ? 'below target' : 'on target') },
  { key: 'tg', name: 'Triglycerides', unit: 'mg/dL', target: 'under 150', status: (v) => (v >= 200 ? 'high' : v >= 150 ? 'above target' : 'on target') },
];
export const WAIST_TARGET = 'Under 102 cm is the usual target for men, and under 94 cm is better.';
export const BP_NOTE = 'Sit quietly for 5 minutes, arm supported at heart height, and take two readings a minute apart, morning and evening.';
export const BP_CRISIS = 'A reading of 180/120 or higher: sit for 5 minutes and measure again. With chest pain, breathlessness, weakness, or changes in vision or speech, get emergency care now.';

// ---- Reminders, exported as calendar events ----
export const REMINDERS = [
  { id: 'walk-lunch', title: 'Steady: 10-minute walk after lunch', time: '13:00', rule: 'FREQ=DAILY', label: 'Walk after lunch, every day' },
  { id: 'walk-dinner', title: 'Steady: 10-minute walk after dinner', time: '20:00', rule: 'FREQ=DAILY', label: 'Walk after dinner, every day' },
  { id: 'log', title: 'Steady: log today (food, water and Watch numbers)', time: '21:30', rule: 'FREQ=DAILY', label: 'Log the day, every evening' },
  { id: 'weigh', title: 'Steady: weigh in before breakfast', time: '07:00', rule: 'FREQ=WEEKLY;BYDAY=MO', label: 'Weigh-in, Mondays' },
  { id: 'prep-sun', title: 'Steady: Sunday meal prep', time: '10:00', rule: 'FREQ=WEEKLY;BYDAY=SU', label: 'Meal prep, Sundays' },
  { id: 'prep-wed', title: 'Steady: Wednesday meal prep', time: '19:00', rule: 'FREQ=WEEKLY;BYDAY=WE', label: 'Meal prep, Wednesdays' },
  { id: 'backup', title: 'Steady: export a backup', time: '20:00', rule: 'FREQ=MONTHLY;BYMONTHDAY=1', label: 'Backup, the 1st of each month' },
];

// ---- iPhone Shortcuts, built by hand once in the Shortcuts app ----
export const SHORTCUT_IN = [
  'In the Shortcuts app, tap + to make a new shortcut and call it Steady Watch.',
  'Add Find Health Samples. Set Type to Steps and the filter to Start Date is in the last 7 days. Tap Add Filter and make it Source is your Apple Watch. Tap Show More, then set Unit to count and Group by to Day.',
  'Add Format Date. Tap its date, tap Select Variable and tap the Health Samples of that search. Tap Health Samples in the action and choose Start Date. Set Date Format to Custom and the format string to yyyy-MM-dd.',
  'Add Round Number. Pick the same Health Samples for its number in the same way, but choose Value. Set it to round to Integer.',
  'Do steps 2 to 4 again for Active Energy with the Unit kcal and for Exercise Minutes with min. Each Format Date and Round Number uses the search just above it.',
  'Add one more Find Health Samples for Cardio Fitness (VO2 max), with the Unit mL/kg/min and the filter Start Date is in the last 3 months. Set Sort by to Start Date and Order to Latest First, then turn on Limit and set it to 1. Then add its Format Date and Round Number as in steps 3 and 4, rounding to Tenths.',
  'Add Text. Type steps on the first line. On the next line, tap Select Variable above the keyboard and tap the Formatted Date of the Steps search. On the line after, add its Rounded Number the same way.',
  'Below that, type move and add the Formatted Date and Rounded Number of the Active Energy search, each on its own line. Do the same with exercise for Exercise Minutes and vo2 for Cardio Fitness.',
  'Add Copy to Clipboard. Tap Show More on it and turn on Local Only, so the numbers stay on this iPhone and do not reach your Mac through Universal Clipboard.',
  'Run it and allow Shortcuts to read each type. Then open Steady, tap Paste from Watch on Today, and tap Paste when the phone asks.',
  'Each run brings in the last 7 days, so a missed evening catches up, and it corrects the days before today. For today, and for the oldest day, which the search may only partly cover, Steady keeps the higher numbers.',
  "Check once that yesterday's steps match the Health app. If Steady shows more, the Source filter is missing from the Steps search: add it and run the shortcut again. A little less is normal if you walked without the Watch.",
  'The Watch measures Cardio Fitness only on outdoor walks, runs and hikes. If the shortcut stops at No Samples Found, change that search to the last 12 months.',
];
export const SHORTCUT_OUT = [
  'Make a second shortcut called Steady to Health.',
  'Add Get Clipboard, then Get Dictionary from Input.',
  'Add Get Dictionary Value for the key energy, then Log Health Sample with the type Dietary Energy and that value.',
  'Repeat for protein (type Protein) and water (type Water, in mL).',
  'In Steady, tap Copy totals for Health, then run the shortcut. Run it once a day, or the totals get counted twice.',
  "Copy totals for Health uses the clipboard, so Universal Clipboard can also pass the day's totals to a Mac or iPad on the same Apple Account. To stop that, turn off Handoff in the iPhone's Settings.",
];

// ---- What's new, shown once after an update. Raise APP_VERSION and add an entry, newest first, when the list changes. ----
export const APP_VERSION = 15;
export const CHANGES = [
  {
    version: 15,
    notes: [
      'VoiceOver hears messages after a sheet closes, can step through each day on a chart, and is told how many searches matched.',
      'Every tappable row, card and link now reacts to your finger, and the chosen tab or segment stays as it is while pressed.',
      'Session screens hide the tab bar, so there is one Start on the screen. Settings pages slide in and out like other pages.',
      'Dragging a sheet puts the keyboard away, a second finger no longer takes over a drag, and pinch zoom works on every screen.',
      'A meal row held still before you let go settles where it is. Spent freezes show as an outline.',
    ],
  },
  {
    version: 14,
    notes: [
      'Calmer motion: buttons and the tab bar no longer bounce. The tab pill stretches a little as it slides, and going back or closing a sheet is quicker than opening.',
      'Ticking a set or logging a meal gives a short pulse, and the new tick fades in.',
      'A meal row stretches when you pull it past its end, and tips grow out from where you tapped.',
    ],
  },
  {
    version: 13,
    notes: [
      'The tab bar is clearer glass now, with a big Start button in the middle. Start opens today\'s next session, or Resume when one is running.',
      'A pill slides to the tab you pick, and each screen rises in instead of snapping.',
      'Pages slide and buttons settle with a softer spring.',
    ],
  },
  {
    version: 12,
    notes: [
      'There is a Settings page now. Tap the gear at the top right of Today, Train, Food or Progress.',
      'Settings groups your targets, training, timer alerts, reminders, data and backup, and About, each on its own page.',
      'Look lets you choose Automatic, Light or Dark. The More tab is gone, as everything in it lives in Settings.',
    ],
  },
  {
    version: 11,
    notes: [
      'Food has three tabs: Menu, Prep and Shopping. Recipes, Eating out and Rules sit at the foot of Menu, and Menu opens at today.',
      'The weight card on Progress names your next milestone. Lifted in total moved to Charts.',
      'More saves as you go, and dates read the way the rest of the app writes them.',
      'Tap the activity grid anywhere to read the nearest day, or a whole month in the year view.',
      'Tighter type and spacing, one shape for full-width buttons, one height for small buttons, and a clearer Progress icon.',
    ],
  },
  {
    version: 10,
    notes: [
      'The food ring now shows what is left, with a mark at your limit and "over" when you pass it.',
      'Train opens with today\'s session and a Start button. How you train moved to More.',
      'Session screens put Start and Log as planned first, the how-to sits under a tap, and the Watch tip shows until you say Got it.',
      'Strength uses the exercise green, the switches use the same green, and weigh-in is one number with 0.1 steps.',
      'Records read as bests, the exercise + button only shows during a workout, and the tab bar is easier to read.',
    ],
  },
  {
    version: 9,
    notes: [
      'Today starts with your three rings, a line saying what is left, and the reminders under them. Swipe a meal left to swap it; Eaten is now a quiet mark.',
      'Progress opens on your weight with a small trend line. Charts holds the weight chart (with a table), Goals holds totals, challenges and milestones, and the views scroll sideways.',
      'Wins such as the streak, badges and records use their own indigo, so orange only means food.',
      'A running workout hides the tab bar. Schedule rows say which body parts a session works.',
      'Drag a finger over the activity grid to read each day. Smaller type scale, stronger grey text in dark mode.',
    ],
  },
  {
    version: 8,
    notes: [
      'Progress opens on an Overview: your week streak with freezes and badges, monthly challenges, an activity grid by weeks or months, recent workouts with records, and your weight with 1M, 3M, 1Y and All.',
      'Train has an Exercises tab with search, body parts, drawings and your own exercises, and the + adds one to the workout you are doing.',
      'Tap a rest day, or a day with only walks, to plan a session there. Rotation shows the next session you have not done, whatever the weekday.',
      'Starting a workout asks for your weight when a weigh-in is due.',
      'A session done on another day than planned still counts for its week.',
    ],
  },
  {
    version: 7,
    notes: [
      'Move a workout to another day from its screen. The week still counts it.',
      'Machine taken? Swap an exercise for a similar one while you train, and Steady keeps the sets and reps.',
      'A New best badge appears as soon as you lift more than you ever have.',
      'Progress has an activity grid for the last 12 weeks, plus your totals.',
    ],
  },
  {
    version: 6,
    notes: [
      'Small buttons and toggles are easier to hit, and a double tap never logs something twice.',
      'Discarding a workout now offers Undo instead of asking first.',
      'Workouts slide in and out, and you can swipe from the left edge to go back.',
      'Ring numbers roll when you log something, and a saved workout gets a tick.',
      'Progress shows a bar for each weekly target.',
      'Dark mode is easier on the eyes, with softer drawings and clearer colours.',
    ],
  },
  {
    version: 5,
    notes: [
      'The Steady Watch shortcut has new steps. It brings in a week at a time and your VO2max, and keeps the numbers off your Mac. Make it again from More, iPhone shortcuts.',
      'Progress now writes a few sentences each week comparing your food and water with your training.',
      'Health checks can make a one-page summary for your doctor and share it as a PDF.',
      'Your weight trend shows the weekly rate and about when you could reach the next milestone.',
      'A VO2max chart, filled in by the Steady Watch shortcut.',
      'Bangkok restaurant dishes in Add food. To stop a meal coming back, swap it and tap Do not suggest this again.',
      'Pause a workout, time your plank holds, and see a picture for most exercises.',
    ],
  },
];
