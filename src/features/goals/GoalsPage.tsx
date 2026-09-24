import { Footprints, Moon, Scale, Sparkles, Target, Utensils, Droplet } from 'lucide-react'
import { db, type Profile } from '../../db/db'
import { useFacts, useLatestWeight, useProfile } from '../../db/hooks'
import { save } from '../../db/repo'
import { GoalRow } from '../../components/GoalRow'
import { Group, IconTile, NavBar, Row, Section } from '../../components/ui'
import { weightKg } from '../../lib/constants'
import { suggestedGoals } from '../../lib/plan'
import { toast } from '../../lib/toast'

/** Every target in one place, with a one-tap start for beginners that never overwrites a goal already set. */
export function GoalsPage() {
  const profile = useProfile()
  const weight = useLatestWeight()
  const facts = useFacts()
  if (profile === undefined || weight === undefined || !facts) return null

  const kg = weightKg(weight ?? undefined)
  const suggestion = suggestedGoals(kg, facts)
  const missing = (Object.keys(suggestion) as (keyof typeof suggestion)[]).filter((k) => suggestion[k] !== undefined && profile?.[k] === undefined)

  async function suggest() {
    const fill = Object.fromEntries(missing.map((k) => [k, suggestion[k]])) as Partial<Profile>
    await save(db.profile, { id: 'me', name: profile?.name ?? '', ...fill })
    toast(`Filled in ${missing.length} ${missing.length === 1 ? 'goal' : 'goals'} — change any of them below`)
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title="Goals" subtitle="What you’re aiming for each day" back="/" />

      {missing.length > 0 && (
        <Section footer={kg ? 'Protein 1.6 g and water about 33 ml per kg of your weight, 8,000 steps, 8 hours’ sleep. Only goals you haven’t set are filled in.' : 'Log your weight first for protein and water suggestions.'}>
          <button type="button" className="btn btn-soft w-full" onClick={suggest}>
            <Sparkles size={18} /> Suggest Goals for Me
          </button>
        </Section>
      )}

      <Section title="Every Day" footer="Adults need at least 7 hours of sleep (AASM and Sleep Research Society). Around 7,000–10,000 steps a day is linked with better long-term health.">
        <Group inset="3.625rem">
          <GoalRow icon={<IconTile icon={Utensils} color="purple" />} field="proteinTarget" label="Protein" unit="g" value={profile?.proteinTarget} />
          <GoalRow icon={<IconTile icon={Droplet} color="blue" />} field="waterTarget" label="Water" unit="ml" value={profile?.waterTarget} />
          <GoalRow icon={<IconTile icon={Footprints} color="green" />} field="stepsTarget" label="Steps" unit="" value={profile?.stepsTarget} />
          <GoalRow icon={<IconTile icon={Moon} color="indigo" />} field="sleepTarget" label="Sleep" unit="h" value={profile?.sleepTarget} decimals />
        </Group>
      </Section>

      <Section title="Weight" footer="Your height is used for BMI. Everything stays on this iPhone.">
        <Group inset="3.625rem">
          <GoalRow icon={<IconTile icon={Target} color="orange" />} field="weightGoal" label="Goal Weight" unit="kg" value={profile?.weightGoal} decimals />
          <GoalRow icon={<IconTile icon={Scale} color="gray" />} field="height" label="Height" unit="cm" value={profile?.height} />
          <Row icon={<IconTile icon={Scale} color="blue" />} title="Weight and BMI" value={weight ? `${weight.value} ${weight.unit}` : 'Not logged'} to="/weight" />
        </Group>
      </Section>
    </div>
  )
}

