import { expect, test, type Page } from '@playwright/test'
import { ANSWERS, mockAi } from './fake-ai'
import { FakeDrive } from './fake-google'
import { dumpDb, importBackup, injuriesBackup, localMidnight, newDevice, PNG, seedDemo, tab } from './helpers'

const DAY = 86_400_000
const save = (page: Page) => page.getByRole('button', { name: 'Save', exact: true }).click()
const proteinToday = (page: Page) => page.getByTestId('protein-today')

test('protein first: a goal, a meal by grams, a saved meal logged in one tap (with undo)', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/nutrition')
  const goal = page.getByLabel('Daily protein goal (g)')
  await goal.fill('120')
  await goal.press('Enter')
  await expect(page.getByText('Daily protein goal: 120 g')).toBeVisible()

  await page.getByRole('link', { name: 'Log meal' }).click()
  await expect(page.getByRole('heading', { name: 'Meal', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Save', exact: true })).toBeDisabled()
  await page.getByLabel('Meal', { exact: true }).fill('Protein shake')
  await page.getByLabel('Protein (g)').fill('32')
  await page.getByLabel('Calories (kcal)').fill('280')
  await page.getByText('Add to Saved Meals').click()
  await save(page)

  await expect(page).toHaveURL(/\/nutrition$/)
  await expect(proteinToday(page)).toHaveText('32')
  await expect(page.getByText('of 120 g protein')).toBeVisible()
  await expect(page.getByText(/1 meal · 280 kcal · 88 g to go/)).toBeVisible()

  // One tap logs a saved meal; Undo takes it back.
  await page.getByRole('button', { name: 'Log Protein shake' }).click()
  await expect(proteinToday(page)).toHaveText('64')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(proteinToday(page)).toHaveText('32')

  const db = await dumpDb(page)
  expect(db.meals.filter((m) => !m.deletedAt)).toMatchObject([{ name: 'Protein shake', protein: 32, calories: 280, items: [], source: 'user' }])
  expect(db.savedMeals).toMatchObject([{ name: 'Protein shake', protein: 32, calories: 280 }])
  expect(db.profile).toMatchObject([{ id: 'me', proteinTarget: 120 }])

  // Today and the timeline
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Nutrition' })).toBeVisible()
  await expect(proteinToday(page)).toHaveText('32')
  await tab(page, 'Timeline').click()
  await page.getByRole('button', { name: 'Meals', exact: true }).click()
  await expect(page.getByRole('link', { name: /Protein shake.*32 g protein · 280 kcal/ })).toBeVisible()
})

test('foods add up to the meal total; edit, delete and undo', async ({ page }) => {
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/meal')
  await page.getByLabel('Meal', { exact: true }).fill('Lunch plate')
  await page.getByLabel('Protein (g)').fill('30')
  await page.getByRole('button', { name: 'Add Foods' }).click()
  // The total typed so far carries over to the first food.
  await expect(page.getByLabel('Protein grams')).toHaveValue('30')
  await page.getByLabel('Food name').fill('Chicken')
  await page.getByRole('button', { name: 'Add Food', exact: true }).click()
  await page.getByLabel('Food name').nth(1).fill('Rice')
  await page.getByLabel('Protein grams').nth(1).fill('4,5')
  await page.getByLabel('kcal', { exact: true }).nth(1).fill('200')
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 35 g protein · 200 kcal')
  await save(page)

  let db = await dumpDb(page)
  expect(db.meals).toMatchObject([{ name: 'Lunch plate', protein: 34.5, calories: 200, items: [{ name: 'Chicken', protein: 30 }, { name: 'Rice', protein: 4.5, calories: 200 }] }])

  await page.goto('/nutrition')
  await page.getByRole('link', { name: /Lunch plate/ }).click()
  await expect(page.getByRole('heading', { name: 'Edit Meal' })).toBeVisible()
  await page.getByRole('button', { name: 'Remove Rice' }).click()
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 30 g protein')
  await save(page)
  await expect(proteinToday(page)).toHaveText('30')

  await page.getByRole('link', { name: /Lunch plate/ }).click()
  await page.getByRole('button', { name: 'Delete Meal' }).click()
  await expect(proteinToday(page)).toHaveText('0')
  await page.getByRole('button', { name: 'Undo' }).click()
  await expect(proteinToday(page)).toHaveText('30')
  db = await dumpDb(page)
  expect(db.meals[0]).toMatchObject({ protein: 30 })
  expect(db.meals[0].calories).toBeUndefined()
})

test('photo estimate: AI drafts the foods, the person checks them, nothing saved until ✓', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/meal')

  await expect(page.getByRole('button', { name: 'Estimate Protein' })).toBeDisabled()
  await page.locator('input[type=file]').setInputFiles({ name: 'meal.png', mimeType: 'image/png', buffer: PNG })
  await expect(page.getByRole('img', { name: 'Meal photo' })).toBeVisible()
  await page.getByRole('button', { name: 'Estimate Protein' }).click()
  await page.getByRole('dialog', { name: 'Use AI in Reclaim?' }).getByRole('button', { name: 'Turn On AI' }).click()

  const answer = ANSWERS['estimate-meal']
  await expect(page.getByLabel('Food name').first()).toHaveValue(answer.items[0].name)
  await expect(page.getByLabel('Meal', { exact: true })).toHaveValue(answer.name)
  await expect(page.getByText('AI estimate — adjust if needed')).toHaveCount(3)
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 53 g protein · 490 kcal')
  await expect(page.getByText(answer.assumptions[0])).toBeVisible()

  // What was sent: a resized JPEG, and no description (none was typed).
  expect(requests).toHaveLength(1)
  expect(requests[0].task).toBe('estimate-meal')
  const input = requests[0].input as { description?: string; image: { mimeType: string; data: string } }
  expect(input.description).toBeUndefined()
  expect(input.image.mimeType).toBe('image/jpeg')
  expect(input.image.data.length).toBeGreaterThan(100)

  // The person corrects the chicken; that food is no longer marked as an estimate.
  await page.getByLabel('Protein grams').first().fill('40')
  await expect(page.getByText('AI estimate — adjust if needed')).toHaveCount(2)
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 47 g protein · 490 kcal')
  expect((await dumpDb(page)).meals).toHaveLength(0)

  await save(page)
  await expect(page.getByText(/Chicken rice bowl · 47 g protein logged/)).toBeVisible()
  const [meal] = (await dumpDb(page)).meals
  expect(meal).toMatchObject({ name: answer.name, protein: 47, calories: 490, source: 'user_confirmed' })
  expect(meal.items).toHaveLength(3)

  await page.goto('/timeline')
  await expect(page.getByRole('link', { name: /Chicken rice bowl.*AI estimate, checked/ })).toBeVisible()
})

test('a description works too; a photo that isn’t food says so', async ({ browser }, info) => {
  const page = await newDevice(browser, info, new FakeDrive())
  const requests = await mockAi(page)
  await importBackup(page, injuriesBackup('Tennis elbow'))
  await page.goto('/log/meal')
  await page.getByLabel('Meal', { exact: true }).fill('150 g grilled chicken, a cup of rice and broccoli')
  await page.getByRole('button', { name: 'Estimate Protein' }).click()
  await page.getByRole('dialog', { name: 'Use AI in Reclaim?' }).getByRole('button', { name: 'Turn On AI' }).click()
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 53 g protein · 490 kcal')
  expect(requests[0].input).toEqual({ description: '150 g grilled chicken, a cup of rice and broccoli' })

  // The last-registered route wins: answer "not food" from now on.
  await page.route('**/api/ai', (route) =>
    route.request().method() === 'POST' ? route.fulfill({ json: { result: { isFood: false, name: '', items: [], assumptions: [] }, model: 'gemini-test' } }) : route.fallback(),
  )
  await page.locator('input[type=file]').setInputFiles({ name: 'cat.png', mimeType: 'image/png', buffer: PNG })
  await page.getByRole('button', { name: 'Estimate Protein' }).click()
  await expect(page.getByRole('alert')).toHaveText(/doesn’t look like food/)
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 53 g protein · 490 kcal') // earlier foods untouched
})

test('demo data: the 7-day protein chart and Today match the log', async ({ page }) => {
  const now = Date.now()
  const backup = await seedDemo(page, now)
  const live = backup.data.meals.filter((m) => !m.deletedAt)
  const expected = Array.from({ length: 7 }, (_, i) => {
    const start = localMidnight(now - (6 - i) * DAY)
    const end = localMidnight(start + 36 * 3_600_000)
    const day = live.filter((m) => m.recordedAt >= start && m.recordedAt < end)
    return day.length ? String(Math.round(day.reduce((a, m) => a + m.protein, 0))) : '—'
  })
  await page.goto('/nutrition')
  await expect(page.getByTestId('protein-day')).toHaveText(expected)
  await expect(proteinToday(page)).toHaveText(expected[6] === '—' ? '0' : expected[6])
  await expect(page.getByText('of 130 g protein')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log Oats with milk and whey' })).toBeVisible()

  // Saved-meal chips prefill the form.
  await page.goto('/log/meal')
  await page.getByRole('button', { name: /^Protein shake · 32 g/ }).click()
  await expect(page.getByLabel('Food name').first()).toHaveValue('Whey protein')
  await expect(page.getByTestId('meal-total')).toHaveText('Total: 32 g protein · 280 kcal')
})
