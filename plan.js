// Plan content: training blocks, sessions, exercises, meals, weekly menu, prep and shopping.
// Calories, protein and fibre are estimates for the portions listed.

export const EFFORT = {
  easy: { label: 'Easy', rpe: '3 to 4', talk: 'You can talk in full sentences', hrr: [0.3, 0.4] },
  moderate: { label: 'Moderate', rpe: '5 to 6', talk: 'You can talk, but not sing', hrr: [0.4, 0.6] },
  hard: { label: 'Hard', rpe: '7 to 8', talk: 'Only a few words at a time', hrr: [0.6, 0.8] },
  strength: { label: 'Strength', rpe: '7', talk: 'End each set with 2 to 3 reps left in the tank', hrr: null },
};

export const EXERCISES = {
  sitstand: { name: 'Chair sit-to-stand', cue: 'Feet hip-width, arms crossed. Sit back until you touch the chair, then stand up tall without using your hands.', alt: 'At the gym: box squat to a bench.' },
  wallpush: { name: 'Counter push-up', cue: 'Hands on a counter edge, body straight from head to heels. Lower your chest to the edge and push back. A lower surface makes it harder.', alt: 'At the gym: chest press machine.' },
  bridge: { name: 'Glute bridge', cue: 'On your back, knees bent, feet flat. Squeeze your glutes and lift your hips until knees, hips and shoulders line up. Pause for a second at the top.', alt: 'At the gym: hip thrust machine.' },
  bprow: { name: 'Backpack row', cue: 'Load a backpack with books or water bottles. One hand and knee on a chair, pull the bag to your hip, lower it slowly. Do both sides.', alt: 'At the gym: seated cable row.' },
  kneeplank: { name: 'Plank on knees', cue: 'Forearms under shoulders, knees down, a straight line from head to knees. Keep breathing.', alt: 'Harder: full plank.' },
  goblet: { name: 'Goblet squat', cue: 'Hold a dumbbell or a loaded backpack at your chest. Sit down between your heels to a comfortable depth, chest up, then stand.', alt: 'At the gym: leg press.' },
  inclinepush: { name: 'Incline push-up', cue: 'Hands on a bench or sturdy table. Lower with control and keep your body straight.', alt: 'At the gym: chest press machine.' },
  splitsquat: { name: 'Supported split squat', cue: 'One foot forward, one back, a hand on a wall or chair. Lower the back knee toward the floor, then push up through the front foot.', alt: 'At the gym: single-leg leg press.' },
  deadbug: { name: 'Dead bug', cue: 'On your back, arms up, knees over hips. Slowly lower the opposite arm and leg while your lower back stays on the floor.', alt: 'Easier: move only the legs.' },
  carry: { name: 'Farmer carry', cue: 'Hold heavy shopping bags or dumbbells at your sides, stand tall and walk. Shoulders down, slow steps.', alt: 'At the gym: dumbbells or kettlebells.' },
  hipthrust: { name: 'Hip thrust', cue: 'Upper back on a bench or sofa edge, feet flat. Drive your hips up, squeeze, lower slowly.', alt: 'At the gym: hip thrust machine or barbell.' },
  rdl: { name: 'Romanian deadlift', cue: 'Hold dumbbells or a backpack in front of your thighs. Push your hips back with a flat back until you feel the back of your thighs, then stand up.', alt: 'At the gym: dumbbells or a barbell.' },
  onearmrow: { name: 'One-arm row', cue: 'Hand and knee on a bench, pull the weight to your hip, lower it slowly.', alt: 'At home: backpack row.' },
  stepup: { name: 'Step-up', cue: 'A low step or stair, whole foot on it. Step up, stand tall, step down with control.', alt: 'Harder: hold a backpack.' },
  sideplank: { name: 'Side plank on knees', cue: 'Forearm under your shoulder, knees bent. Lift your hips into a straight line.', alt: 'Harder: legs straight.' },
  legpress: { name: 'Leg press', cue: 'Feet shoulder-width in the middle of the platform. Lower until your knees are at about 90 degrees, then press without locking them.', alt: 'At home: goblet squat.' },
  chestpress: { name: 'Chest press machine', cue: 'Handles at mid-chest height. Press out, return slowly.', alt: 'At home: incline push-up.' },
  pulldown: { name: 'Lat pulldown', cue: 'Pull the bar to your upper chest, elbows down and back, then return slowly.', alt: 'At home: backpack row.' },
  cablerow: { name: 'Seated cable row', cue: 'Sit tall, pull the handle to your stomach and squeeze your shoulder blades together.', alt: 'At home: backpack row.' },
  shoulderpress: { name: 'Shoulder press machine', cue: 'Handles at shoulder height. Press up without arching your back.', alt: 'At home: press two water bottles overhead.' },
  legcurl: { name: 'Leg curl machine', cue: 'Pad just above your heels. Curl smoothly, lower slowly.', alt: 'At home: glute bridge.' },
  pallof: { name: 'Pallof press', cue: 'Stand side-on to a cable or band at chest height. Press the handle straight out and resist the twist.', alt: 'At home: dead bug.' },
  plank: { name: 'Plank', cue: 'Forearms under shoulders, body straight, glutes squeezed. Keep breathing.', alt: 'Easier: plank on knees.' },
};

// Each exercise row: [exercise id, sets, reps or time, rest in seconds].
export const SESSIONS = {
  walks: {
    name: 'Post-meal walks', kind: 'walk', effort: 'easy', minutes: 20,
    how: 'Walk 10 minutes after lunch and 10 minutes after dinner, starting within half an hour of the meal. Brisk enough that your breathing picks up.',
    why: 'A walk after a meal lowers the blood sugar rise from that meal. On a bad week, keep doing this and drop the rest.',
  },
  longwalk: {
    name: 'Long outdoor walk', kind: 'walk', effort: 'moderate',
    how: 'Start an Outdoor Walk workout on the Watch and keep a steady pace in the moderate range. In the hot months, go before 08:00 or after 19:00 and carry water.',
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

export const PROGRESSION = 'When every set reaches the top of the rep range with 2 reps still in the tank, add a little weight next time: a book in the backpack, or the next step on the machine.';

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
    name: 'Build to 250', weeks: [13, null], targets: { exMin: 250, steps: 8500, strength: 2 },
    intro: 'Longer cardio and a sixth interval. Hold this, train indoors in the hot months, and keep the post-meal walks.',
    days: [
      [{ s: 'walks' }, { s: 'cardio', min: 45 }], [{ s: 'walks' }, { s: 'gymA' }], [{ s: 'walks' }, { s: 'intervals', min: 40, reps: 6 }],
      [{ s: 'walks' }], [{ s: 'walks' }, { s: 'cardio', min: 50 }], [{ s: 'gymB' }], [{ s: 'longwalk', min: 60 }],
    ],
  },
];

// slot: breakfast, lunch, dinner, snack or extra. where: home (cook), prep (from the batch), out (order).
export const MEALS = [
  { id: 'oats', name: 'Overnight oats with whey', slot: 'breakfast', kcal: 500, p: 40, fib: 11, where: 'prep',
    ing: ['50 g rolled oats', '200 ml low-fat milk', '1 scoop whey protein (30 g)', '10 g chia seeds', '100 g berries (frozen is fine)'],
    steps: ['Mix everything in a jar the night before.', 'Keep in the fridge, eat cold. Keeps 3 days.'] },
  { id: 'yogbowl', name: 'Greek yogurt oat bowl', slot: 'breakfast', kcal: 460, p: 33, fib: 8, where: 'home',
    ing: ['250 g low-fat Greek yogurt', '40 g rolled oats', '100 g berries or 1 small banana', '15 g walnuts'],
    steps: ['Layer in a bowl. No sugar or honey needed with the fruit.'] },
  { id: 'eggtoast', name: 'Eggs, whites and wholegrain toast', slot: 'breakfast', kcal: 535, p: 33, fib: 11, where: 'home',
    ing: ['2 eggs plus 3 egg whites', '2 slices wholegrain bread', '1 tsp olive oil', 'Tomato and cucumber', '1 apple'],
    steps: ['Scramble the eggs and whites in the oil over medium heat.', 'Serve on the toast with the vegetables, apple on the side.'] },
  { id: 'chakchouka', name: 'Chakchouka with eggs', slot: 'breakfast', kcal: 525, p: 34, fib: 9, where: 'prep',
    ing: ['250 g chakchouka base (from prep)', '2 eggs plus 3 egg whites', '2 slices wholegrain bread'],
    steps: ['Heat the base in a small pan until it bubbles.', 'Make two wells, crack in the eggs, pour the whites around, cover for 5 to 6 minutes.'] },
  { id: 'khaotom', name: 'Khao tom gai with egg (eating out)', slot: 'breakfast', kcal: 400, p: 30, fib: 1, where: 'out',
    ing: ['Rice soup with chicken and an egg'],
    steps: ['Ask for no fried garlic oil on top. Add the chili and lime instead of sugar.'] },

  { id: 'chxbowl', name: 'Chicken, brown rice and roast vegetable bowl', slot: 'lunch', kcal: 660, p: 51, fib: 8, where: 'prep',
    ing: ['120 g cooked chicken breast', '180 g cooked brown rice', '200 g roast vegetables', '60 g yogurt herb sauce', 'About 1 tbsp olive oil used in cooking'],
    steps: ['Pack in a lunch box from the Sunday prep.', 'Microwave until steaming hot all the way through. Add the sauce after heating.'] },
  { id: 'chorba', name: 'Lentil chorba with chicken and bread', slot: 'lunch', kcal: 670, p: 49, fib: 16, where: 'prep',
    ing: ['1 bowl lentil chorba (60 g red lentils, tomato, carrot, onion, 2 tsp olive oil)', '80 g cooked chicken', '2 slices wholegrain bread'],
    steps: ['Reheat a portion of the batch until boiling.', 'Stir in the chicken, add lemon and coriander.'] },
  { id: 'salmon', name: 'Salmon, sweet potato and broccoli', slot: 'lunch', kcal: 590, p: 37, fib: 13, where: 'home',
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

  { id: 'fishstir', name: 'Fish, tofu and vegetable stir-fry', slot: 'dinner', kcal: 670, p: 53, fib: 9, where: 'home',
    ing: ['120 g white fish (barramundi or tilapia)', '100 g firm tofu', '250 g mixed vegetables', '2 tsp oil', '1 tbsp oyster or soy sauce', '150 g cooked brown rice (from prep)'],
    steps: ['Pan-fry the fish and tofu in half the oil, 3 minutes a side, set aside.', 'Stir-fry the vegetables in the rest for 4 minutes, add the sauce, return the fish and tofu.', 'Serve with the rice. About 20 minutes.'] },
  { id: 'saba', name: 'Grilled saba, rice, edamame and greens', slot: 'dinner', kcal: 620, p: 46, fib: 9, where: 'home',
    ing: ['1 saba (mackerel) fillet, about 120 g', '120 g cooked rice', '100 g shelled edamame', 'Cucumber and greens'],
    steps: ['Air fryer 200°C for 8 to 10 minutes, skin side up, or a dry pan.', 'Microwave the edamame for 3 minutes.'] },
  { id: 'loubia', name: 'Loubia (white bean stew) with chicken', slot: 'dinner', kcal: 650, p: 49, fib: 18, where: 'prep',
    ing: ['1 portion loubia from prep (about 240 g beans in tomato sauce)', '80 g cooked chicken (thawed overnight)', 'Side salad', '1 slice wholegrain bread'],
    steps: ['Reheat the beans until bubbling, add the chicken for the last 2 minutes.'] },
  { id: 'couscous', name: 'Wholewheat couscous with vegetables and chicken', slot: 'dinner', kcal: 705, p: 53, fib: 15, where: 'home',
    ing: ['70 g dry wholewheat couscous', '120 g chicken breast', '250 g zucchini, carrot and onion', '60 g chickpeas', '2 tsp olive oil', 'Ras el hanout, cumin, low-salt stock'],
    steps: ['Simmer the chicken and vegetables in 400 ml stock with the spices for 20 minutes.', 'Pour boiling water over the couscous to just cover, lid on for 5 minutes, fluff with a fork.', 'Serve the stew over the couscous.'] },
  { id: 'traybake', name: 'Chicken thigh and vegetable tray bake', slot: 'dinner', kcal: 660, p: 45, fib: 12, where: 'prep',
    ing: ['150 g skinless chicken thigh (cooked weight)', '300 g peppers, onion, zucchini and pumpkin', '150 g potato or sweet potato', '1 tbsp olive oil', 'Paprika, garlic, lemon'],
    steps: ['From the Wednesday prep. Reheat until steaming hot.'] },
  { id: 'omelette', name: 'Big omelette and salad', slot: 'dinner', kcal: 530, p: 39, fib: 8, where: 'home',
    ing: ['2 eggs plus 4 egg whites', '150 g vegetables (onion, pepper, spinach)', '30 g feta', '1 tsp oil plus 1 tsp olive oil on the salad', 'Large side salad', '1 slice wholegrain bread'],
    steps: ['Soften the vegetables in the oil, pour in the eggs, crumble the feta on top, finish under a lid. 10 minutes.'] },

  { id: 'yogfruit', name: 'Greek yogurt with fruit', slot: 'snack', kcal: 190, p: 21, fib: 3, where: 'home', ing: ['200 g low-fat Greek yogurt', '100 g fruit'], steps: [] },
  { id: 'applenuts', name: 'Apple and almonds', slot: 'snack', kcal: 210, p: 5, fib: 7, where: 'home', ing: ['1 apple', '20 g almonds (about 15)'], steps: [] },
  { id: 'edamame', name: 'Edamame', slot: 'snack', kcal: 145, p: 14, fib: 6, where: 'home', ing: ['120 g shelled edamame'], steps: [] },
  { id: 'milk', name: 'Glass of low-fat milk', slot: 'snack', kcal: 140, p: 10, fib: 0, where: 'home', ing: ['300 ml low-fat milk'], steps: [] },
  { id: 'shake', name: 'Whey shake with milk', slot: 'snack', kcal: 235, p: 32, fib: 0, where: 'home', ing: ['1 scoop whey (30 g)', '250 ml low-fat milk'], steps: [] },
  { id: 'hummus', name: 'Hummus and vegetable sticks', slot: 'snack', kcal: 165, p: 7, fib: 7, where: 'home', ing: ['80 g hummus', 'Carrot and cucumber sticks'], steps: [] },
  { id: 'eggs2', name: 'Two boiled eggs', slot: 'snack', kcal: 145, p: 13, fib: 0, where: 'home', ing: ['2 eggs'], steps: [] },
  { id: 'guava', name: 'Guava', slot: 'snack', kcal: 100, p: 4, fib: 8, where: 'home', ing: ['1 small guava (about 150 g)'], steps: [] },
  { id: 'banana', name: 'Banana', slot: 'snack', kcal: 105, p: 1, fib: 3, where: 'home', ing: ['1 medium banana'], steps: [] },
  { id: 'coffee', name: 'Coffee with milk, no sugar', slot: 'snack', kcal: 50, p: 3, fib: 0, where: 'home', ing: ['Coffee with 100 ml low-fat milk'], steps: [] },

  { id: 'thaitea', name: 'Thai iced tea, sweetened', slot: 'extra', kcal: 250, p: 3, fib: 0, where: 'out', ing: [], steps: [] },
  { id: 'bubbletea', name: 'Bubble milk tea', slot: 'extra', kcal: 380, p: 3, fib: 0, where: 'out', ing: [], steps: [] },
  { id: 'softdrink', name: 'Soft drink, can', slot: 'extra', kcal: 140, p: 0, fib: 0, where: 'out', ing: [], steps: [] },
  { id: 'juice', name: 'Fruit juice, glass', slot: 'extra', kcal: 120, p: 1, fib: 0, where: 'out', ing: [], steps: [] },
  { id: 'khaopad', name: 'Fried rice, plate', slot: 'extra', kcal: 650, p: 20, fib: 2, where: 'out', ing: [], steps: [] },
  { id: 'padthai', name: 'Pad thai', slot: 'extra', kcal: 700, p: 25, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'khaomangai', name: 'Khao man gai', slot: 'extra', kcal: 650, p: 30, fib: 1, where: 'out', ing: [], steps: [] },
  { id: 'greencurry', name: 'Green curry with rice', slot: 'extra', kcal: 800, p: 30, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'mango', name: 'Mango sticky rice', slot: 'extra', kcal: 500, p: 6, fib: 3, where: 'out', ing: [], steps: [] },
  { id: 'pastry', name: 'Croissant or pastry', slot: 'extra', kcal: 300, p: 6, fib: 1, where: 'out', ing: [], steps: [] },
];

// Monday to Sunday. Each day comes to about 2,150 to 2,300 kcal, which leaves room for extras.
export const MENU = [
  { breakfast: 'oats', lunch: 'chxbowl', dinner: 'fishstir', snack: ['guava', 'applenuts', 'coffee'] },
  { breakfast: 'chakchouka', lunch: 'chxbowl', dinner: 'chorba', snack: ['edamame', 'milk', 'coffee'] },
  { breakfast: 'oats', lunch: 'chxbowl', dinner: 'saba', snack: ['yogfruit', 'applenuts', 'coffee'] },
  { breakfast: 'eggtoast', lunch: 'loubia', dinner: 'traybake', snack: ['yogfruit', 'hummus', 'coffee'] },
  { breakfast: 'oats', lunch: 'krapao', dinner: 'traybake', snack: ['applenuts', 'milk', 'banana', 'coffee'] },
  { breakfast: 'chakchouka', lunch: 'gaiyang', dinner: 'couscous', snack: ['yogfruit', 'guava', 'banana', 'coffee'] },
  { breakfast: 'eggtoast', lunch: 'chorba', dinner: 'omelette', snack: ['applenuts', 'shake', 'coffee'] },
];
export const SLOTS = ['breakfast', 'lunch', 'dinner', 'snack'];

export const MENU_NOTE = 'Swap any meal for another from the same slot. Salmon, the yogurt bowl and the eating-out dishes are the usual swaps. Cheaper fish: saba, tilapia (pla nil) or barramundi (pla kapong).';

export const PREP = [
  {
    day: 'Sunday', time: 'About 90 minutes', covers: 'Monday to Wednesday lunches, Sunday and Tuesday chorba, Tuesday breakfast, Monday and Wednesday oats',
    steps: [
      'Rice: cook 300 g dry brown rice (rice cooker brown setting, or 1 part rice to 2 parts water for 40 minutes). Spread it out to cool and get it in the fridge within an hour.',
      'Chicken: season 1 kg chicken breast with salt, pepper, paprika, garlic and lemon. Air fryer 180°C for 18 to 22 minutes, oven 200°C for 20 to 25, or a pan for 6 to 7 minutes a side, until the juices run clear. Slice once cool.',
      'Portion the chicken: three 120 g portions for the lunch bowls and two 80 g portions for the Sunday and Tuesday chorba. Freeze one 80 g portion for Thursday and one 120 g portion for Saturday.',
      'Roast vegetables: 800 g of pumpkin, zucchini, peppers, onion and broccoli with 1 tbsp olive oil. Air fryer or oven at 200 to 220°C for 20 to 25 minutes.',
      'Lentil chorba: soften 1 onion and 2 carrots in 2 tbsp olive oil, add 1 tsp each of cumin and paprika, 250 g red lentils, 400 g chopped tomatoes and 1.5 L low-salt stock. Simmer 25 minutes. Four portions: Sunday, Tuesday, and two for the freezer.',
      'Chakchouka base: soften 2 onions, 4 peppers and 3 garlic cloves in 2 tbsp olive oil, add 800 g tomatoes, paprika and cumin, simmer 20 minutes. Four 250 g portions: two in the fridge (Tuesday and a spare), two in the freezer (Saturday and a spare).',
      'Yogurt herb sauce: 200 g low-fat Greek yogurt, 1 grated garlic clove, lemon juice, mint and parsley.',
      'Pack three lunch boxes (chicken, 180 g rice, 200 g vegetables) and two jars of overnight oats.',
    ],
  },
  {
    day: 'Wednesday', time: 'About 45 minutes', covers: 'Thursday and Friday dinners, Thursday lunch, Friday oats',
    steps: [
      'Tray bake: 500 g skinless chicken thighs, 600 g peppers, onion, zucchini and pumpkin and 300 g potato in chunks, with 2 tbsp olive oil, paprika, garlic and lemon. 200°C for 30 to 35 minutes. Two portions.',
      'Loubia: soften 1 onion and 2 garlic cloves in 2 tbsp olive oil, add 3 drained cans of white beans, 400 g chopped tomatoes, cumin and paprika and a splash of water. Simmer 15 minutes. Three portions: Thursday and two for the freezer.',
      'Move Thursday\'s 80 g chicken and Saturday\'s chakchouka from the freezer to the fridge.',
      'One jar of overnight oats for Friday.',
    ],
  },
];

export const FOOD_SAFETY = [
  'Cooked chicken and rice keep 3 days in the fridge. Freeze anything for day 4 or later.',
  'Cool cooked rice fast and refrigerate it within an hour. Rice left warm is a common cause of food poisoning.',
  'Reheat until steaming hot all the way through, and reheat only once.',
  'Thaw frozen portions in the fridge overnight.',
];

export const SHOPPING = [
  { group: 'Protein and dairy', items: ['Chicken breast, 1 kg', 'Skinless chicken thighs, 500 g', 'White fish (barramundi or tilapia), 150 g', 'Saba (mackerel) fillet, 1', 'Firm tofu, 1 block', 'Eggs, 10', 'Liquid egg white, 500 g carton (or 16 extra eggs, whites only)', 'Low-fat Greek yogurt, 1 kg', 'Low-fat milk, 2.5 L', 'Whey protein (lasts several weeks)', 'Feta, small pack'] },
  { group: 'Grains and beans', items: ['Brown rice (1 kg lasts 2 to 3 weeks)', 'Rolled oats, 500 g', 'Wholegrain bread, 1 loaf', 'Wholewheat couscous, 500 g', 'Red lentils, 500 g', 'White beans, 3 cans', 'Chickpeas, 1 can', 'Potatoes or sweet potatoes, 500 g'] },
  { group: 'Vegetables and fruit', items: ['Tomatoes, 1.2 kg, plus 2 cans chopped tomatoes', 'Peppers, 8', 'Onions, 1 kg', 'Garlic, 1 head', 'Carrots, 500 g', 'Zucchini, 4', 'Pumpkin, 500 g', 'Broccoli, 1 head', 'Cucumbers, 3', 'Salad leaves or cabbage', 'Morning glory or pak choi, 2 bunches', 'Frozen edamame, 500 g', 'Frozen berries, 500 g', 'Apples, 6', 'Guavas, 2', 'Bananas, 2', 'Lemons or limes, 4', 'Mint, parsley and coriander'] },
  { group: 'Pantry', items: ['Olive oil', 'Almonds, 250 g', 'Chia seeds', 'Hummus, 1 tub', 'Cumin, paprika and ras el hanout', 'Low-salt stock cubes', 'Oyster or soy sauce'] },
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
    'Fried rice, pad thai, khao man gai (around 650 to 750 kcal a plate)',
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
  'No sugary drinks, including juice and sweetened coffee or tea. Order drinks mai wan.',
  'Fill half the plate with vegetables, a quarter with protein, a quarter with rice, noodles or bread.',
  'Eat the protein and vegetables first and the rice last. It lowers the blood sugar rise.',
  'Have protein at every meal and reach the daily target.',
  'Drink to the water target. It goes up on training days.',
  'Keep red meat, offal, shellfish, sardines and anchovies occasional. They raise uric acid and LDL.',
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
