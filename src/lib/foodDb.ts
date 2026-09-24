import type { Nutrients } from '../db/db'

/**
 * A small built-in food list: common Indian and everyday foods, per 100 g as eaten, with familiar servings.
 *
 * Values are approximate — generic foods from standard food-composition data (USDA FoodData Central), home-style
 * Indian dishes as typical recipes (they vary with oil, ghee and portion) — and shown as approximate in the app.
 * Packaged foods differ by brand: their label, entered in My Foods, beats this list.
 */

export interface DbFood {
  id: string
  name: string
  /** Other names people search for. */
  aka?: string
  /** Per 100 g: kcal, protein, carbs, fat, fiber, sugar (g). */
  per100: [kcal: number, protein: number, carbs: number, fat: number, fiber: number, sugar?: number]
  /** Servings as [label, grams]; the first is the default. */
  servings: [string, number][]
}

const f = (id: string, name: string, per100: DbFood['per100'], servings: DbFood['servings'], aka?: string): DbFood => ({ id, name, per100, servings, aka })

const KATORI: [string, number] = ['1 katori (150 g)', 150]
const CUP = (g: number): [string, number] => ['1 cup', g]
const G100: [string, number] = ['100 g', 100]

export const FOODS: DbFood[] = [
  // Grains, breads, breakfast
  f('rice', 'Rice, white, cooked', [130, 2.7, 28.2, 0.3, 0.4, 0.1], [KATORI, CUP(160), G100], 'chawal plain rice'),
  f('brown-rice', 'Rice, brown, cooked', [123, 2.7, 25.6, 1, 1.6], [KATORI, G100]),
  f('jeera-rice', 'Jeera rice', [160, 3, 28, 4, 0.6], [KATORI, G100]),
  f('veg-biryani', 'Veg biryani', [160, 3.5, 24, 5.5, 1.5], [['1 plate (250 g)', 250], KATORI, G100], 'pulao'),
  f('chicken-biryani', 'Chicken biryani', [170, 9, 20, 6, 0.8], [['1 plate (300 g)', 300], KATORI, G100]),
  f('khichdi', 'Khichdi', [120, 4.5, 20, 2.5, 2], [KATORI, G100]),
  f('roti', 'Roti / chapati', [280, 9.5, 50, 4.5, 6], [['1 roti (40 g)', 40], G100], 'chapati phulka fulka'),
  f('paratha', 'Paratha, plain', [320, 7, 45, 13, 5], [['1 paratha (70 g)', 70], G100]),
  f('aloo-paratha', 'Aloo paratha', [250, 5.5, 36, 9.5, 3.5], [['1 paratha (120 g)', 120], G100]),
  f('naan', 'Naan', [291, 9.6, 50.4, 5.7, 2.2], [['1 naan (90 g)', 90], G100]),
  f('puri', 'Puri', [330, 6.5, 42, 15, 3], [['1 puri (25 g)', 25], G100]),
  f('idli', 'Idli', [130, 4, 27, 0.5, 1.2], [['1 idli (40 g)', 40], G100]),
  f('dosa', 'Dosa, plain', [168, 3.9, 29, 3.7, 1], [['1 dosa (80 g)', 80], G100]),
  f('masala-dosa', 'Masala dosa', [170, 3.8, 25, 6, 2], [['1 dosa (175 g)', 175], G100]),
  f('uttapam', 'Uttapam', [160, 4.5, 26, 4, 1.8], [['1 uttapam (120 g)', 120], G100]),
  f('poha', 'Poha', [160, 3.5, 25, 5, 1.5], [['1 plate (200 g)', 200], G100]),
  f('upma', 'Upma', [150, 3.5, 22, 5, 1.5], [['1 plate (200 g)', 200], G100]),
  f('oats', 'Oats, dry', [389, 16.9, 66.3, 6.9, 10.6, 1], [['40 g', 40], G100], 'rolled oats'),
  f('muesli', 'Muesli', [370, 10, 66, 6, 7.5, 18], [['40 g', 40], G100]),
  f('cornflakes', 'Cornflakes', [357, 7.5, 84, 0.4, 3.3, 9], [['30 g', 30], G100]),
  f('dalia', 'Dalia (broken wheat), cooked', [83, 3.1, 18.6, 0.2, 4.5], [KATORI, G100], 'bulgur'),
  f('quinoa', 'Quinoa, cooked', [120, 4.4, 21.3, 1.9, 2.8], [KATORI, G100]),
  f('bread-white', 'Bread, white', [265, 9, 49, 3.2, 2.7, 5], [['1 slice (25 g)', 25], G100]),
  f('bread-brown', 'Bread, whole wheat', [252, 12.4, 42.7, 3.5, 6, 4.4], [['1 slice (32 g)', 32], G100], 'brown bread atta bread'),
  f('pav', 'Pav', [280, 9, 50, 4.5, 2.5, 5], [['1 pav (40 g)', 40], G100], 'bun'),
  f('pasta', 'Pasta, cooked', [158, 5.8, 30.9, 0.9, 1.8], [CUP(140), G100], 'spaghetti macaroni'),

  // Dals and pulses
  f('dal-toor', 'Dal, toor / arhar', [100, 5.5, 14, 2.5, 3], [KATORI, G100], 'dal tadka pigeon pea'),
  f('dal-moong', 'Dal, moong', [95, 6, 13, 2, 2.5], [KATORI, G100]),
  f('dal-masoor', 'Dal, masoor', [100, 6.5, 14, 2, 3], [KATORI, G100], 'red lentil'),
  f('dal-chana', 'Dal, chana', [120, 6.5, 17, 3, 4], [KATORI, G100]),
  f('dal-makhani', 'Dal makhani', [150, 6, 14, 8, 4], [KATORI, G100]),
  f('rajma', 'Rajma curry', [120, 5.5, 16, 4, 5], [KATORI, G100], 'kidney beans'),
  f('chole', 'Chole (chickpea curry)', [140, 6, 18, 5, 5], [KATORI, G100], 'chana masala'),
  f('sambar', 'Sambar', [60, 2.5, 8, 2, 2], [KATORI, G100]),
  f('chickpeas', 'Chickpeas, boiled', [164, 8.9, 27.4, 2.6, 7.6, 4.8], [KATORI, G100], 'kabuli chana'),
  f('soya-chunks', 'Soya chunks, dry', [345, 52, 33, 0.5, 13], [['30 g', 30], G100], 'nutrela'),
  f('tofu', 'Tofu, firm', [144, 17.3, 2.8, 8.7, 2.3], [G100]),

  // Dairy and eggs
  f('milk-toned', 'Milk, toned (3% fat)', [58, 3.1, 4.7, 3, 0, 4.7], [['1 glass (250 ml)', 258], CUP(245), G100], 'doodh'),
  f('milk-full', 'Milk, full cream', [88, 3.2, 5, 6, 0, 5], [['1 glass (250 ml)', 258], G100]),
  f('milk-skim', 'Milk, skimmed', [35, 3.4, 5, 0.1, 0, 5], [['1 glass (250 ml)', 258], G100]),
  f('curd', 'Curd / dahi', [61, 3.5, 4.7, 3.3, 0, 4.7], [KATORI, G100], 'yogurt yoghurt'),
  f('greek-yogurt', 'Greek yogurt, plain, low-fat', [59, 10.2, 3.6, 0.4, 0, 3.2], [['1 cup (170 g)', 170], G100]),
  f('paneer', 'Paneer', [280, 18, 3.5, 22, 0], [G100, ['50 g', 50]], 'cottage cheese'),
  f('cheese-slice', 'Cheese slice', [315, 20, 2, 25, 0], [['1 slice (20 g)', 20], G100]),
  f('buttermilk', 'Buttermilk / chaas', [25, 1.5, 2, 1.2, 0, 2], [['1 glass (250 ml)', 250], G100]),
  f('lassi', 'Lassi, sweet', [100, 3, 16, 2.8, 0, 15], [['1 glass (250 ml)', 250], G100]),
  f('whey', 'Whey protein', [400, 80, 8, 5, 0, 4], [['1 scoop (30 g)', 30], G100], 'protein powder shake'),
  f('egg', 'Egg, boiled', [155, 12.6, 1.1, 10.6, 0, 1.1], [['1 egg (50 g)', 50], ['2 eggs', 100]], 'anda'),
  f('egg-white', 'Egg white', [52, 10.9, 0.7, 0.2, 0, 0.7], [['1 egg white (33 g)', 33], G100]),
  f('omelette', 'Omelette (2 eggs)', [154, 10.6, 0.6, 11.7, 0, 0.6], [['1 omelette (120 g)', 120], G100]),
  f('egg-bhurji', 'Egg bhurji', [180, 11, 3, 14, 0.5], [['2 eggs (120 g)', 120], G100], 'scrambled eggs'),
  f('butter', 'Butter', [717, 0.9, 0.1, 81, 0], [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14]]),
  f('ghee', 'Ghee', [900, 0, 0, 100, 0], [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14]]),

  // Meat, fish
  f('chicken-breast', 'Chicken breast, cooked', [165, 31, 0, 3.6, 0], [G100, ['150 g', 150]], 'grilled chicken'),
  f('chicken-curry', 'Chicken curry', [140, 13, 4, 8, 0.8], [KATORI, G100]),
  f('butter-chicken', 'Butter chicken', [200, 13, 6, 14, 0.8], [KATORI, G100]),
  f('tandoori-chicken', 'Tandoori chicken', [150, 25, 2, 5, 0.3], [['2 pieces (150 g)', 150], G100], 'chicken tikka'),
  f('egg-curry', 'Egg curry', [130, 7, 5, 9, 1], [KATORI, G100]),
  f('fish-curry', 'Fish curry', [120, 12, 3, 6.5, 0.5], [KATORI, G100]),
  f('fish', 'Fish fillet, cooked', [110, 20, 0, 3, 0], [G100], 'rohu basa pomfret'),
  f('mutton-curry', 'Mutton curry', [180, 14, 3, 12.5, 0.5], [KATORI, G100]),
  f('prawns', 'Prawns, cooked', [99, 24, 0.2, 0.3, 0], [G100], 'shrimp'),
  f('tuna', 'Tuna, canned in water', [116, 25.5, 0, 0.8, 0], [['1 can (120 g)', 120], G100]),

  // Vegetables and dishes
  f('mixed-veg', 'Mixed vegetable sabzi', [90, 2.5, 9, 5, 3], [KATORI, G100], 'sabji subzi'),
  f('aloo-sabzi', 'Aloo sabzi', [120, 2, 15, 6, 2], [KATORI, G100], 'potato curry'),
  f('bhindi', 'Bhindi fry', [110, 2.5, 9, 7.5, 4], [KATORI, G100], 'okra'),
  f('palak-paneer', 'Palak paneer', [150, 7, 5, 11.5, 2], [KATORI, G100]),
  f('paneer-butter-masala', 'Paneer butter masala', [230, 8, 8, 19, 1.5], [KATORI, G100]),
  f('salad', 'Salad (cucumber, tomato, onion)', [20, 0.9, 4, 0.2, 1.3, 2.5], [['1 bowl (150 g)', 150], G100]),
  f('cucumber', 'Cucumber', [15, 0.7, 3.6, 0.1, 0.5, 1.7], [G100]),
  f('tomato', 'Tomato', [18, 0.9, 3.9, 0.2, 1.2, 2.6], [['1 medium (120 g)', 120], G100]),
  f('spinach', 'Spinach, cooked', [23, 3, 3.8, 0.3, 2.4, 0.4], [['1 cup (180 g)', 180], G100], 'palak'),
  f('broccoli', 'Broccoli, cooked', [35, 2.4, 7.2, 0.4, 3.3, 1.4], [['1 cup (156 g)', 156], G100]),
  f('potato', 'Potato, boiled', [87, 1.9, 20, 0.1, 1.8, 0.9], [['1 medium (150 g)', 150], G100]),
  f('sweet-potato', 'Sweet potato, boiled', [76, 1.4, 17.7, 0.1, 2.5, 5.7], [['1 medium (130 g)', 130], G100], 'shakarkandi'),
  f('carrot', 'Carrot', [41, 0.9, 9.6, 0.2, 2.8, 4.7], [['1 medium (60 g)', 60], G100], 'gajar'),
  f('pav-bhaji', 'Pav bhaji (bhaji only)', [110, 2.5, 12, 6, 3], [KATORI, G100]),

  // Fruit
  f('banana', 'Banana', [89, 1.1, 22.8, 0.3, 2.6, 12.2], [['1 medium (118 g)', 118], G100], 'kela'),
  f('apple', 'Apple', [52, 0.3, 13.8, 0.2, 2.4, 10.4], [['1 medium (182 g)', 182], G100], 'seb'),
  f('orange', 'Orange', [47, 0.9, 11.8, 0.1, 2.4, 9.4], [['1 medium (131 g)', 131], G100]),
  f('mango', 'Mango', [60, 0.8, 15, 0.4, 1.6, 13.7], [['1 cup (165 g)', 165], G100], 'aam'),
  f('papaya', 'Papaya', [43, 0.5, 10.8, 0.3, 1.7, 7.8], [['1 cup (145 g)', 145], G100]),
  f('grapes', 'Grapes', [69, 0.7, 18.1, 0.2, 0.9, 15.5], [['1 cup (151 g)', 151], G100]),
  f('watermelon', 'Watermelon', [30, 0.6, 7.6, 0.2, 0.4, 6.2], [['1 cup (152 g)', 152], G100]),
  f('pomegranate', 'Pomegranate', [83, 1.7, 18.7, 1.2, 4, 13.7], [['1 cup (174 g)', 174], G100], 'anar'),
  f('guava', 'Guava', [68, 2.6, 14.3, 1, 5.4, 8.9], [['1 medium (100 g)', 100]], 'amrood'),
  f('dates', 'Dates', [277, 1.8, 75, 0.2, 6.7, 66], [['1 date (24 g)', 24], G100], 'khajoor'),

  // Nuts and seeds
  f('almonds', 'Almonds', [579, 21.2, 21.6, 49.9, 12.5, 4.4], [['10 almonds (12 g)', 12], G100], 'badam'),
  f('walnuts', 'Walnuts', [654, 15.2, 13.7, 65.2, 6.7, 2.6], [['4 halves (15 g)', 15], G100], 'akhrot'),
  f('cashews', 'Cashews', [553, 18.2, 30.2, 43.9, 3.3, 5.9], [['10 cashews (15 g)', 15], G100], 'kaju'),
  f('peanuts', 'Peanuts, roasted', [585, 23.7, 21.5, 49.7, 8, 4.2], [['1 handful (30 g)', 30], G100], 'groundnut moongphali'),
  f('peanut-butter', 'Peanut butter', [588, 25, 20, 50, 6, 9], [['1 tbsp (16 g)', 16], G100]),
  f('chia', 'Chia seeds', [486, 16.5, 42.1, 30.7, 34.4], [['1 tbsp (12 g)', 12], G100]),
  f('flax', 'Flax seeds', [534, 18.3, 28.9, 42.2, 27.3, 1.6], [['1 tbsp (10 g)', 10], G100], 'alsi'),

  // Snacks, sweets, drinks, extras
  f('samosa', 'Samosa', [262, 3.5, 24, 17, 2.5], [['1 samosa (80 g)', 80], G100]),
  f('pakora', 'Pakora', [315, 7, 30, 19, 4], [['5 pieces (75 g)', 75], G100], 'bhajji pakoda'),
  f('dhokla', 'Dhokla', [160, 6.5, 24, 4.2, 2], [['2 pieces (100 g)', 100], G100]),
  f('biscuits-marie', 'Biscuits, Marie', [440, 7, 76, 12, 2, 22], [['4 biscuits (24 g)', 24], G100]),
  f('chips', 'Potato chips', [536, 7, 53, 34.6, 4.4, 0.3], [['1 small pack (28 g)', 28], G100]),
  f('namkeen', 'Namkeen / bhujia', [540, 12, 45, 35, 4], [['1 handful (30 g)', 30], G100], 'mixture'),
  f('dark-chocolate', 'Dark chocolate (70%)', [598, 7.8, 45.9, 42.6, 10.9, 24], [['2 squares (20 g)', 20], G100]),
  f('gulab-jamun', 'Gulab jamun', [300, 5, 45, 11, 0.5, 35], [['1 piece (50 g)', 50], G100]),
  f('rasgulla', 'Rasgulla', [180, 4, 38, 1.5, 0, 34], [['1 piece (60 g)', 60], G100]),
  f('kheer', 'Kheer', [150, 4, 22, 5, 0.3, 17], [KATORI, G100]),
  f('pizza', 'Pizza, cheese', [266, 11.4, 33, 10.4, 2.3, 3.6], [['1 slice (107 g)', 107], G100]),
  f('chai', 'Tea with milk and sugar', [45, 1.3, 6.5, 1.5, 0, 6], [['1 cup (150 ml)', 150]], 'chai'),
  f('coffee-milk', 'Coffee with milk and sugar', [45, 1.3, 6.5, 1.5, 0, 6], [['1 cup (150 ml)', 150]]),
  f('coffee-black', 'Coffee, black', [1, 0.1, 0, 0, 0], [['1 cup (240 ml)', 240]]),
  f('coconut-water', 'Coconut water', [19, 0.7, 3.7, 0.2, 1.1, 2.6], [['1 glass (250 ml)', 250]], 'nariyal pani'),
  f('sugar', 'Sugar', [387, 0, 100, 0, 0, 100], [['1 tsp (4 g)', 4]], 'chini'),
  f('honey', 'Honey', [304, 0.3, 82.4, 0, 0.2, 82.1], [['1 tsp (7 g)', 7]], 'shahad'),
  f('oil', 'Cooking oil', [884, 0, 0, 100, 0], [['1 tsp (5 g)', 5], ['1 tbsp (14 g)', 14]], 'tel'),
]

/** Nutrients for `grams` of a food from the list. */
export function forGrams(food: DbFood, grams: number): Nutrients {
  const [kcal, protein, carbs, fat, fiber, sugar] = food.per100
  const r = (n: number) => Math.round(n * (grams / 100) * 10) / 10
  return { calories: Math.round(kcal * (grams / 100)), protein: r(protein), carbs: r(carbs), fat: r(fat), fiber: r(fiber), ...(sugar !== undefined && { sugar: r(sugar) }) }
}

/** Foods matching a search: every word must appear in the name or its other names; name matches first. */
export function searchFoods(query: string, limit = 40) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return FOODS.map((food) => {
    const name = food.name.toLowerCase()
    const hay = `${name} ${food.aka ?? ''}`
    if (!words.every((w) => hay.includes(w))) return undefined
    return { food, rank: name.startsWith(words[0]) ? 0 : name.includes(words[0]) ? 1 : 2 }
  })
    .filter((x) => !!x)
    .sort((a, b) => a.rank - b.rank || a.food.name.localeCompare(b.food.name))
    .slice(0, limit)
    .map((x) => x.food)
}
