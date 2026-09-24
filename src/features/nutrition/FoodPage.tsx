import { useParams } from 'react-router'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../../db/db'
import { restore, softDelete } from '../../db/repo'
import { NavBar, Section } from '../../components/ui'
import { useBack } from '../../lib/nav'
import { toast } from '../../lib/toast'
import { DeleteRow } from '../log/shared'
import { CustomFoodForm } from './FoodPicker'

/** Add a food to My Foods from its label (`/nutrition/foods/new`), or edit one. */
export function FoodPage() {
  const { id = 'new' } = useParams()
  const back = useBack('/nutrition')
  const existing = useLiveQuery(async () => (id === 'new' ? null : ((await db.foods.get(id)) ?? null)), [id])
  if (existing === undefined) return null
  if (id !== 'new' && (!existing || existing.deletedAt)) return <NavBar title="Food Not Found" back="/nutrition" />

  async function remove() {
    await softDelete(db.foods, id)
    toast(`${existing!.name} deleted`, { label: 'Undo', onClick: () => restore(db.foods, id) })
    back()
  }

  return (
    <div className="space-y-7 pb-4">
      <NavBar title={existing ? existing.name : 'New Food'} back="/nutrition" />
      <Section className="space-y-6">
        <CustomFoodForm
          existing={existing ?? undefined}
          onSaved={(f) => {
            toast(existing ? 'Food updated' : `${f.name} added to My Foods`)
            back()
          }}
        />
      </Section>
      {existing && <Section><DeleteRow label="Delete Food" onDelete={remove} /></Section>}
    </div>
  )
}
