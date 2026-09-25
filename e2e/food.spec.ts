import { expect, test, type Page } from '@playwright/test'
import { forGrams, FOODS, searchFoods } from '../src/lib/foodDb'
import { macroGuide, scale, suggestedCalories, totals } from '../src/lib/nutrition'
import { ANSWERS, mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, importBackup, injuriesBackup, newDevice } from './helpers'

const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).click()

test('food list, portions, totals and the calorie goal are worked out correctly', () => {
  // Every food has sensible numbers: energy roughly matches its macros (4/4/9 kcal per g), within a margin
  // for fiber, alcohol-free rounding and label conventions.
  for (const f of FOODS) {
    const [kcal, p, c, fat] = f.per100
    const fromMacros = p * 4 + c * 4 + fat * 9
    expect(Math.abs(kcal - fromMacros), `${f.name}: ${kcal} kcal vs ${Math.round(fromMacros)} from macros`).toBeLessThanOrEqual(Math.max(25, kcal * 0.2))
    expect(f.servings.length, f.name).toBeGreaterThan(0)
  }
  expect(new Set(FOODS.map((f) => f.id)).size).toBe(FOODS.length)

  const roti = FOODS.find((f) => f.id === 'roti')!
  expect(forGrams(roti, 80)).toEqual({ calories: 224, protein: 7.6, carbs: 40, fat: 3.6, fiber: 4.8 })
  expect(searchFoods('dal')[0].name).toMatch(/^Dal/)
  expect(searchFoods('chapati').map((f) => f.id)).toContain('roti') // other names count
  expect(searchFoods('paneer masala').map((f) => f.id)).toEqual(['paneer-butter-masala'])

  expect(totals([{ protein: 10, calories: 100 }, { protein: 5.25, carbs: 20 }])).toEqual({ protein: 15.3, calories: 100, carbs: 20 })
  expect(scale({ protein: 30, calories: 400, fiber: 8 }, 0.25)).toEqual({ protein: 7.5, calories: 100, fiber: 2 })

  const now = new Date(2026, 8, 24)
  // Mifflin–St Jeor: man, 30, 178 cm, 85 kg → 1,817.5 kcal resting × 1.375 ≈ 2,499 → −500 to lose → 2,000
  expect(suggestedCalories({ sex: 'male', birthYear: 1996, height: 178, activity: 'light', weightPlan: 'lose' }, 85, now)).toBe(2000)
  expect(suggestedCalories({ sex: 'female', birthYear: 1996, height: 155, activity: 'sedentary', weightPlan: 'lose' }, 50, now)).toBe(1200) // never below the floor
  expect(suggestedCalories({ sex: 'male', height: 178, activity: 'light' }, 85, now)).toBeUndefined() // needs the year of birth
  expect(macroGuide(2000, 130)).toEqual({ fat: 67, carbs: 219 })
})

test('search a food, choose a portion, and the meal adds up — with carbs, fat and fiber', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/meal')
  await page.getByLabel('Meal', { exact: true }).fill('Lunch')
  await page.getByRole('button', { name: 'Search Foods' }).click()
  await page.getByLabel('Search foods').fill('roti')
  await page.getByRole('button', { name: /^Roti \/ chapati/ }).click()
  await page.getByRole('button', { name: '2', exact: true }).click()
  await expect(page.getByTestId('portion-kcal')).toHaveText('224 kcal')
  await page.getByRole('button', { name: 'Add to Meal' }).click()

  await page.getByRole('button', { name: 'Search Foods' }).click()
  await page.getByLabel('Search foods').fill('toor')
  await page.getByRole('button', { name: /^Dal, toor/ }).click()
  await page.getByRole('button', { name: 'Add to Meal' }).click()

  await expect(page.getByTestId('meal-total')).toHaveText('Total: 16 g protein · 374 kcal')
  await expect(page.getByTestId('meal-macros')).toHaveText('Carbs 61 g · Fat 7 g · Fiber 9 g')
  await save(page)

  const [meal] = (await dumpDb(page)).meals
  expect(meal).toMatchObject({ name: 'Lunch', protein: 15.9, calories: 374, carbs: 61, fat: 7.4, fiber: 9.3 })
  expect(meal.items).toMatchObject([{ name: 'Roti / chapati', amount: '2 × 1 roti (40 g)', foodId: 'db:roti' }, { name: 'Dal, toor / arhar', foodId: 'db:dal-toor' }])

  // Recent foods come back with one tap
  await page.goto('/log/meal')
  await page.getByRole('button', { name: 'Search Foods' }).click()
  await page.getByRole('button', { name: /^Add Roti \/ chapati, 2 × 1 roti/ }).click()
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 8 g protein · 224 kcal')
})

test('a food from its label goes into My Foods and is found by search', async ({ page }) => {
  await page.goto('/log/meal')
  await page.getByRole('button', { name: 'Search Foods' }).click()
  await page.getByLabel('Search foods').fill('Protein bar')
  await page.getByRole('button', { name: 'Create “Protein bar”' }).click()
  const form = page.getByRole('dialog', { name: 'Add food' })
  await form.getByLabel('Serving', { exact: true }).fill('1 bar')
  await form.getByLabel('Calories (kcal)').fill('210')
  await form.getByLabel('Protein (g)').fill('20')
  await form.getByLabel('Sodium (mg)').fill('180')
  await page.getByRole('button', { name: 'Save Food' }).click()
  await page.getByRole('button', { name: 'Add to Meal' }).click()
  await page.getByLabel('Meal', { exact: true }).fill('Snack')
  await save(page)

  const db = await dumpDb(page)
  expect(db.foods).toMatchObject([{ name: 'Protein bar', serving: '1 bar', calories: 210, protein: 20, sodium: 180 }])
  expect(db.meals[0]).toMatchObject({ calories: 210, protein: 20, sodium: 180 })
  await page.goto('/nutrition')
  await expect(page.getByRole('link', { name: /Protein bar.*1 bar · 210 kcal · P 20/ })).toBeVisible()
  await expect(page.getByText(/Sodium 180 mg/)).toBeVisible()
})

test('a recipe that makes 4 servings logs one serving with one tap', async ({ page }) => {
  await page.goto('/log/meal?saved=')
  await page.getByLabel('Meal', { exact: true }).fill('Chicken curry (pot)')
  await page.getByRole('button', { name: 'Add by Hand' }).click()
  await page.getByLabel('Food name').fill('Chicken curry')
  await page.getByLabel('Protein grams').fill('120')
  await page.getByRole('textbox', { name: 'kcal' }).or(page.locator('input[placeholder="—"]').first()).first().fill('1400')
  await page.getByLabel('Servings this recipe makes').fill('4')
  await save(page)
  await expect(page.getByText('Chicken curry (pot) added to Saved Meals')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Log Chicken curry (pot)' })).toContainText('1 of 4 servings · 350 kcal · P 30')
  await page.getByRole('button', { name: 'Log Chicken curry (pot)' }).click()
  expect((await dumpDb(page)).meals).toMatchObject([{ name: 'Chicken curry (pot)', protein: 30, calories: 350 }])
})

test('goals: calories worked out from the profile, and meal ideas that fit what’s left', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/measurement?kind=weight')
  await page.getByLabel('Value').fill('85')
  await save(page)

  await page.goto('/goals')
  await page.getByRole('button', { name: 'Male', exact: true }).click()
  await page.getByLabel('Year of Birth').fill(String(new Date().getFullYear() - 30))
  await page.getByLabel('Year of Birth').press('Enter')
  await page.getByLabel('Height (cm)').fill('178')
  await page.getByLabel('Height (cm)').press('Enter')
  await page.getByRole('button', { name: 'Lightly active' }).click()
  await page.getByRole('radio', { name: 'Lose' }).click()
  await expect(page.getByTestId('suggested-calories')).toHaveText('2,000 kcal a day')
  await page.getByRole('button', { name: 'Use', exact: true }).click()
  await expect(page.getByLabel('Calories (kcal)')).toHaveValue('2000')
  await page.getByRole('button', { name: 'Vegetarian', exact: true }).click()

  await page.goto('/nutrition')
  await expect(page.getByText('of 2,000 kcal')).toBeVisible()
  await page.getByRole('button', { name: 'Suggest Meals' }).click()
  await page.getByRole('dialog', { name: 'Use AI in Reclaim?' }).getByRole('button', { name: 'Turn On AI' }).click()
  await expect(page.getByText(ANSWERS['meal-ideas'].ideas[0].name)).toBeVisible()
  const sent = requests.at(-1)!
  expect(sent.task).toBe('meal-ideas')
  expect(sent.input.context).toMatchObject({ remaining: { calories: 2000 }, diet: 'vegetarian' })
})

test('pick foods and save: no need to type a meal name, it’s named after the foods', async ({ page }) => {
  await page.goto('/log/meal')
  for (const [query, food] of [['boiled egg', /^Egg, boiled/], ['roti', /^Roti \/ chapati/]] as const) {
    await page.getByRole('button', { name: 'Search Foods' }).click()
    await page.getByLabel('Search foods').fill(query)
    await page.getByRole('button', { name: food }).click()
    await page.getByRole('button', { name: 'Add to Meal' }).click()
  }
  await expect(page.getByLabel('Meal', { exact: true })).toHaveAttribute('placeholder', 'Egg, boiled + Roti / chapati')
  await save(page)
  expect((await dumpDb(page)).meals).toMatchObject([{ name: 'Egg, boiled + Roti / chapati' }])
})
