import { Droplet, Flame, Footprints, Leaf, Moon, Scale, Sparkles, Target, Utensils } from 'lucide-react'
import { db, type Profile } from '../../db/db'
import { useFacts, useLatestWeight, useProfile } from '../../db/hooks'
import { save } from '../../db/repo'
import { GoalRow } from '../../components/GoalRow'
import { Chips, Group, IconTile, NavBar, Row, Section, Segmented } from '../../components/ui'
import { weightKg } from '../../lib/constants'
import { ACTIVITY_LEVELS, suggestedCalories } from '../../lib/nutrition'
import { suggestedGoals } from '../../lib/plan'
import { toast } from '../../lib/toast'

const PLANS = [
  { value: 'lose' as const, label: 'Lose' },
  { value: 'maintain' as const, label: 'Maintain' },
  { value: 'gain' as const, label: 'Gain' },
]
const DIETS = [
  { value: 'vegetarian' as const, label: 'Vegetarian' },
  { value: 'eggetarian' as const, label: 'Eggetarian' },
  { value: 'non-vegetarian' as const, label: 'Non-vegetarian' },
  { value: 'vegan' as const, label: 'Vegan' },
]

/** Every target in one place, with a one-tap start for beginners that never overwrites a goal already set. */
export function GoalsPage() {
  const profile = useProfile()
  const weight = useLatestWeight()
  const facts = useFacts()
  if (profile === undefined || weight === undefined || !facts) return null

  const kg = weightKg(weight ?? undefined)
  const suggestion = suggestedGoals(kg, facts, profile ?? {})
  const missing = (Object.keys(suggestion) as (keyof typeof suggestion)[]).filter((k) => suggestion[k] !== undefined && profile?.[k] === undefined)
  const calories = suggestedCalories(profile ?? {}, kg)
  const set = (patch: Partial<Profile>) => save(db.profile, { id: 'me', name: profile?.name ?? '', ...patch })

  async function suggest() {
    await set(Object.fromEntries(missing.map((k) => [k, suggestion[k]])) as Partial<Profile>)
    toast(`Filled in ${missing.length} ${missing.length === 1 ? 'goal' : 'goals'} — change any of them below`)
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Goals" subtitle="What you’re aiming for each day" back="/" />

      {missing.length > 0 && (
        <Section footer={kg ? 'Protein 1.6 g and water about 33 ml per kg of your weight, fiber 30 g, 8,000 steps, 8 hours’ sleep, and calories once “Work Out My Calories” below is filled in. Only goals you haven’t set are filled in.' : 'Log your weight first for protein, water and calorie suggestions.'}>
          <button type="button" className="btn btn-soft w-full" onClick={suggest}>
            <Sparkles size={18} /> Suggest Goals for Me
          </button>
        </Section>
      )}

      <Section title="Every Day" footer="Adults need at least 7 hours of sleep (AASM and Sleep Research Society). Around 7,000–10,000 steps a day is linked with better long-term health. Fiber: 25–38 g a day for adults (EFSA; US Institute of Medicine).">
        <Group inset="3.625rem">
          <GoalRow icon={<IconTile icon={Flame} color="orange" />} field="calorieTarget" label="Calories" unit="kcal" value={profile?.calorieTarget} />
          <GoalRow icon={<IconTile icon={Utensils} color="purple" />} field="proteinTarget" label="Protein" unit="g" value={profile?.proteinTarget} />
          <GoalRow icon={<IconTile icon={Leaf} color="green" />} field="fiberTarget" label="Fiber" unit="g" value={profile?.fiberTarget} />
          <GoalRow icon={<IconTile icon={Droplet} color="blue" />} field="waterTarget" label="Water" unit="ml" value={profile?.waterTarget} />
          <GoalRow icon={<IconTile icon={Footprints} color="green" />} field="stepsTarget" label="Steps" unit="" value={profile?.stepsTarget} />
          <GoalRow icon={<IconTile icon={Moon} color="indigo" />} field="sleepTarget" label="Sleep" unit="h" value={profile?.sleepTarget} decimals />
        </Group>
      </Section>

      <Section
        title="Work Out My Calories"
        footer="Mifflin–St Jeor resting energy × your activity, then 500 kcal less a day to lose about 0.5 kg a week, or 300 more to gain. Never below 1,200 (women) or 1,500 (men) kcal without a clinician or dietitian. Not for pregnancy or under-18s — ask your doctor."
      >
        <div className="space-y-3">
          <div>
            <span className="section-label block">Sex</span>
            <Chips wrap options={[{ value: 'female' as const, label: 'Female' }, { value: 'male' as const, label: 'Male' }]} value={profile?.sex} onChange={(sex) => set({ sex })} />
          </div>
          <Group>
            <GoalRow field="birthYear" label="Year of Birth" unit="" value={profile?.birthYear} placeholder="e.g. 1995" />
            <GoalRow field="height" label="Height" unit="cm" value={profile?.height} />
          </Group>
          <div>
            <span className="section-label block">Activity</span>
            <Chips wrap options={ACTIVITY_LEVELS} value={profile?.activity} onChange={(activity) => set({ activity })} />
          </div>
          <div>
            <span className="section-label block">Weight Plan</span>
            <Segmented options={PLANS} value={profile?.weightPlan ?? 'maintain'} onChange={(weightPlan) => set({ weightPlan })} />
          </div>
          {calories ? (
            <div className="card flex items-center gap-3 p-4">
              <span className="min-w-0 flex-1">
                <span className="block text-[0.875rem] text-muted">Suggested</span>
                <span className="font-rounded block text-[1.5rem] font-semibold" data-testid="suggested-calories">{calories.toLocaleString()} kcal a day</span>
              </span>
              {calories !== profile?.calorieTarget && (
                <button type="button" className="btn btn-primary shrink-0" onClick={() => set({ calorieTarget: calories }).then(() => toast(`Calories: ${calories.toLocaleString()} kcal`))}>Use</button>
              )}
            </div>
          ) : (
            <p className="px-1 text-[0.9375rem] text-muted">{!kg ? 'Log your weight' : 'Fill in the year of birth, height, sex and activity'} to see a suggestion.</p>
          )}
        </div>
      </Section>

      <Section title="Food Preference" footer="Used for meal ideas.">
        <Chips wrap options={DIETS} value={profile?.diet} onChange={(diet) => set({ diet })} />
      </Section>

      <Section title="Weight" footer="Your height is used for BMI. Everything stays on this iPhone.">
        <Group inset="3.625rem">
          <GoalRow icon={<IconTile icon={Target} color="orange" />} field="weightGoal" label="Goal Weight" unit="kg" value={profile?.weightGoal} decimals />
          <Row icon={<IconTile icon={Scale} color="blue" />} title="Weight and BMI" value={weight ? `${weight.value} ${weight.unit}` : 'Not logged'} to="/weight" />
        </Group>
      </Section>
    </div>
  )
}
