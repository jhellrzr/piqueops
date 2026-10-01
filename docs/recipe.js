export const SOURCE = {
  title: 'Pique sauce · Husbands That Cook',
  url: 'https://www.husbandsthatcook.com/2016/08/pique-sauce/',
  credit: 'Sol Food-inspired recipe by Husbands That Cook, adapted from Scot Lang.'
};

// Source quantities are volume measures and pepper counts, not estimated weights.
export const INGREDIENTS = [
  { id: 'jalapenos', name: 'Green jalapeños', amount: 5, unit: '', stage: 'Soak' },
  { id: 'white-vinegar', name: 'White vinegar', amount: 4, unit: 'cup', liquid: true, stage: 'Soak' },
  { id: 'arbol', name: 'Dried chiles de árbol', amount: 40, unit: '', stage: 'Simmer' },
  { id: 'garlic', name: 'Garlic', amount: 6, unit: 'clove', stage: 'Simmer' },
  { id: 'onion', name: 'Chopped onion', amount: 2, unit: 'tbsp', stage: 'Simmer' },
  { id: 'carrot', name: 'Chopped carrot', amount: 0.5, unit: 'cup', stage: 'Simmer' },
  { id: 'rice-vinegar', name: 'Rice vinegar, unseasoned', amount: 0.25, unit: 'cup', liquid: true, stage: 'Blend' },
  { id: 'salt', name: 'Salt', amount: 0.25, unit: 'cup', stage: 'Blend' },
  { id: 'pepper', name: 'Ground black pepper', amount: 1, unit: 'tsp', stage: 'Blend' },
  { id: 'cooking-water', name: 'Reserved cooking liquid', amount: 1, unit: 'cup', liquid: true, stage: 'Blend', pantry: true },
  { id: 'serrano', name: 'Serrano chile', amount: 1, unit: 'per bottle', perBottle: true, stage: 'Bottle' }
];

// A concise original summary. Link to the publisher for the full recipe and notes.
export const STEPS = [
  { id: 'soak', title: 'Soak in the fridge', aside: 'The only dependency worth waiting for.', text: 'Stem and slit the jalapeños without separating them. Cover with white vinegar; refrigerate 12–48 hours. Remove the jalapeños; keep the vinegar.' },
  { id: 'simmer', title: 'Simmer the vegetables', aside: 'Finally, a ten-minute meeting with an outcome.', text: 'Stem the dried chiles. Cover them, peeled garlic, onion, and carrot with water. Boil, then simmer about 10 minutes until carrot softens. Drain, saving the liquid.' },
  { id: 'blend', title: 'Blend the batch', aside: 'Merge conflicts should be smooth.', text: 'Blend cooked vegetables with infused vinegar, rice vinegar, measured cooking liquid, salt, and pepper until smooth. Adjust acidity with vinegar or cooking liquid.' },
  { id: 'bottle', title: 'Bottle. Refrigerate. Eat.', aside: 'Deploy to whichever dinner needs it.', text: 'Bottle with one stemmed serrano in each container. Refrigerate. Use now, or let the flavors settle for a few days.' }
];

export const SCALES = [0.5, 1, 2, 3];
const CUP_ML = 236.5882365;
export function formatQuantity(value) {
  const whole = Math.floor(value);
  const fraction = value - whole;
  const fractions = [[0.125, '⅛'], [0.25, '¼'], [0.375, '⅜'], [0.5, '½'], [0.625, '⅝'], [0.75, '¾'], [0.875, '⅞']];
  const found = fractions.find(([number]) => Math.abs(number - fraction) < 0.00001);
  return found ? `${whole || ''}${found[1]}` : String(Number(value.toFixed(2)));
}

export function scaledIngredients(scale = 1, metric = false) {
  if (!SCALES.includes(scale)) throw new Error('Choose a half, single, double, or triple batch.');
  return INGREDIENTS.map(ingredient => {
    const amount = ingredient.amount * (ingredient.perBottle ? 1 : scale);
    let quantity = formatQuantity(amount);
    let unit = ingredient.unit;
    if (metric && ingredient.liquid) { quantity = String(Math.round(amount * CUP_ML)); unit = 'mL'; }
    else if (['cup', 'clove'].includes(unit) && amount > 1) unit += 's';
    return { ...ingredient, amount, quantity: `${quantity}${unit ? ` ${unit}` : ''}` };
  });
}

export function shoppingList(scale = 1, metric = false) {
  return `PIQUEOPS / SHOPPING LIST\n${formatQuantity(scale)}× batch\n\n${scaledIngredients(scale, metric).filter(i => !i.pantry).map(i => `☐ ${i.quantity} ${i.name}`).join('\n')}\n\nAlso: water for simmering; keep the measured cooking liquid.\n\n${SOURCE.credit}\n${SOURCE.url}\n`;
}

export function soakReady(startedAt, hours) {
  const timestamp = new Date(startedAt).getTime();
  if (!Number.isFinite(timestamp) || ![12, 24, 48].includes(hours)) throw new Error('Choose a valid start time and a 12, 24, or 48-hour soak.');
  return new Date(timestamp + hours * 60 * 60 * 1000).toISOString();
}

export function timerRemaining(timer, now = Date.now()) {
  if (!timer) return 600;
  if (timer.deadline !== null) return Math.max(0, Math.ceil((timer.deadline - now) / 1000));
  return timer.remaining;
}

export function makeBatch({ name, scale, soakHours, peppers, heat, tang, notes }, id, date = new Date().toISOString()) {
  if (!SCALES.includes(scale)) throw new Error('Invalid batch scale.');
  if (!Number.isFinite(soakHours) || soakHours < 0 || soakHours > 168) throw new Error('Soak hours must be between 0 and 168.');
  if (![0, 1, 2, 3, 4, 5].includes(heat) || ![0, 1, 2, 3, 4, 5].includes(tang)) throw new Error('Ratings must be between 0 (not tasted) and 5.');
  if (typeof id !== 'string' || !id || !Number.isFinite(new Date(date).getTime())) throw new Error('Invalid batch record.');
  const clean = (value, max) => String(value ?? '').trim().slice(0, max);
  return { id, date, name: clean(name, 80) || 'The one I will definitely label', scale, soakHours, peppers: clean(peppers, 240), heat, tang, notes: clean(notes, 2000) };
}

export function validNotebook(value) {
  if (!value || value.version !== 1 || !Array.isArray(value.batches) || value.batches.length > 100) return false;
  try {
    const ids = new Set();
    for (const batch of value.batches) {
      if (ids.has(batch.id) || typeof batch.date !== 'string' || typeof batch.name !== 'string' || typeof batch.notes !== 'string' || typeof batch.peppers !== 'string') return false;
      ids.add(batch.id);
      const normalized = makeBatch(batch, batch.id, batch.date);
      if (normalized.name !== batch.name || normalized.notes !== batch.notes || normalized.peppers !== batch.peppers) return false;
    }
    return true;
  } catch { return false; }
}
