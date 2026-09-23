import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useBack, useGo } from '../../lib/nav'
import { db } from '../../db/db'
import { isOpenInjury } from '../../db/hooks'
import { alive, restore, save, setMeta, softDelete } from '../../db/repo'
import { AiAction } from '../../components/ai'
import { Group } from '../../components/ui'
import { runAi } from '../../lib/ai'
import { dayKey } from '../../lib/dates'
import { haptic } from '../../lib/haptics'
import { requestPersistence } from '../../lib/platform'
import { toast } from '../../lib/toast'
import type { NoteSuggestions } from './NoteReviewPage'
import { DeleteRow, SheetForm, WhenRow } from './shared'

export function NoteLogPage() {
  const [params] = useSearchParams()
  const id = params.get('id') ?? undefined
  const back = useBack('/', 'sheet-down')
  const go = useGo()
  const [text, setText] = useState('')
  const [recordedAt, setRecordedAt] = useState(Date.now())
  const [loaded, setLoaded] = useState(!id)
  /** A new note gets an id once it's saved (e.g. before structuring), so it isn't saved twice. */
  const [savedId, setSavedId] = useState(id)

  useEffect(() => {
    if (!id) return
    db.journal.get(id).then((n) => {
      if (n) {
        setText(n.text)
        setRecordedAt(n.recordedAt)
      }
      setLoaded(true)
    })
  }, [id])

  if (!loaded) return null

  const persist = async () => {
    const noteId = await save(db.journal, { id: savedId, text: text.trim(), recordedAt, source: 'user' })
    setSavedId(noteId)
    void requestPersistence()
    return noteId
  }

  async function submit() {
    haptic()
    await persist()
    toast(id ? 'Note updated' : 'Note saved')
    back()
  }

  /** Save the note, ask AI for draft entries, then review them. */
  async function structure() {
    const noteId = await persist()
    const injuries = (await db.injuries.toArray()).filter((i) => alive(i) && isOpenInjury(i)).map((i) => ({ id: i.id, name: i.name, region: i.bodyRegion }))
    const result = await runAi('structure-note', { text: text.trim(), date: dayKey(recordedAt), injuries })
    await setMeta('noteSuggestions', { noteId, result } satisfies NoteSuggestions)
    go(`/log/review?note=${noteId}`, 'push', { replace: true })
  }

  async function remove() {
    await softDelete(db.journal, id!)
    toast('Note deleted', { label: 'Undo', onClick: () => restore(db.journal, id!) })
    back()
  }

  return (
    <SheetForm title={id ? 'Edit Note' : 'Note'} canSave={!!text.trim()} onSubmit={submit} onClose={back}>
      <textarea
        className="input min-h-60 leading-relaxed"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="How did today go? e.g. Elbow was fine in the morning, sore after 8 hours at the laptop. Did physio once and went for a walk."
        maxLength={4000}
        aria-label="Note"
      />
      <Group>
        <WhenRow value={recordedAt} onChange={setRecordedAt} />
      </Group>
      <div>
        <AiAction label="Turn into Entries" runningLabel="Reading your note…" run={structure} disabled={!text.trim()} />
        <p className="section-footer">AI drafts symptoms and measurements from your note. You review them before anything is saved.</p>
      </div>
      {id && <DeleteRow label="Delete Note" onDelete={remove} />}
    </SheetForm>
  )
}
