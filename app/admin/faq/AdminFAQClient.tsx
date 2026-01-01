"use client"

import React, { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { safeSelect, safeInsert, safeUpdate, safeDelete } from '@/lib/supabaseHelpers'
import Modal from '@/components/Modal'
import { Plus, Edit, Trash, GripVertical, Check } from 'lucide-react'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm'

export default function AdminFAQClient() {
  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete } = useTwoStepConfirm<string>(4500)
  const [faqs, setFaqs] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [editing, setEditing] = useState<any|null>(null)
  const [open, setOpen] = useState(false)
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [isActive, setIsActive] = useState(true)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  useEffect(() => { fetchFaqs() }, [])

  async function fetchFaqs() {
    setLoading(true)
    const { data, error, missingTable } = await safeSelect(supabase, 'faqs', 'id,question,answer,is_active,display_order,created_at')
    if (missingTable) {
      setFaqs([])
    } else if (error) {
      console.error('Failed to load faqs', error)
      setFaqs([])
    } else if (data) {
      const rows = (data as any[]).sort((a,b) => (a.display_order||100) - (b.display_order||100))
      setFaqs(rows)
    }
    setLoading(false)
  }

  // Drag & drop handlers
  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id)
    e.dataTransfer.effectAllowed = 'move'
  }

  function onDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
  }

  function onDragEnter(e: React.DragEvent, idx: number) {
    e.preventDefault()
    setHoverIndex(idx)
  }

  function onDragLeave(e: React.DragEvent) {
    e.preventDefault()
    // don't clear here to avoid jitter; will be cleared on drop or dragend
  }

  async function onDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault()
    const fromId = draggingId
    if (!fromId) return

    // build list excluding dragged item
    const list = faqs.filter(f => f.id !== fromId)

    // compute intended insert index
    const insertAt = hoverIndex !== null ? hoverIndex : list.findIndex(f => f.id === targetId)
    const boundedIndex = Math.max(0, Math.min(insertAt, list.length))

    const moved = faqs.find(f => f.id === fromId)!
    list.splice(boundedIndex, 0, moved)

    const updated = list.map((f, idx) => ({ ...f, display_order: idx + 1 }))
    setFaqs(updated)

    // set local state; persist when user clicks 'Opslaan volgorde'
    setOrderChanged(true)
    setDraggingId(null)
    setHoverIndex(null)
  }

  function onDragEnd() {
    setDraggingId(null)
    setHoverIndex(null)
  }

  const [initialOrder, setInitialOrder] = useState<string[]>([])
  const [orderChanged, setOrderChanged] = useState(false)

  useEffect(() => {
    setInitialOrder(faqs.map(f => f.id))
    setOrderChanged(false)
  }, [faqs.length])

  async function persistOrder() {
    setSavingOrder(true)
    try {
      const payload = faqs.map((f, idx) => ({ id: f.id, display_order: idx + 1 }))
      const resp = await fetch('/api/admin/faqs/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: payload }),
        credentials: 'same-origin'
      })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json?.error || 'Failed to save order')
      // reflect persisted order
      await fetchFaqs()
      setOrderChanged(false)
    } catch (err) {
      console.error('Failed to persist order', err)
      await fetchFaqs()
    } finally {
      setSavingOrder(false)
    }
  }

  function beginCreate() {
    setEditing(null)
    setQuestion('')
    setAnswer('')
    setIsActive(true)
    setOpen(true)
  }

  function beginEdit(row: any) {
    setEditing(row)
    setQuestion(row.question)
    setAnswer(row.answer)
    setIsActive(!!row.is_active)
    setOpen(true)
  }

  async function save() {
    setLoading(true)
    try {
      const { data: authData } = await supabase.auth.getUser()
      const currentUserId = (authData && (authData as any).user) ? (authData as any).user.id : null

      if (editing) {
        const { success, error, missingTable } = await safeUpdate(supabase, 'faqs', { question, answer, is_active: isActive, created_by: currentUserId }, { id: editing.id })
        if (!success) console.error('update faq error', error, missingTable)
      } else {
        const { success, error, missingTable } = await safeInsert(supabase, 'faqs', { question, answer, is_active: isActive, created_by: currentUserId })
        if (!success) console.error('insert faq error', error, missingTable)
      }

      setOpen(false)
      await fetchFaqs()
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    setLoading(true)
    try {
      const { success, error, missingTable } = await safeDelete(supabase, 'faqs', { id })
      if (!success) console.error('delete faq error', error, missingTable)
      await fetchFaqs()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold">FAQ beheer</h2>
        <div>
          <button onClick={beginCreate} className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 text-white rounded">
            <Plus className="w-4 h-4" /> Nieuwe vraag
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <div className="text-sm text-slate-500">Sleep de items via het handvat om de volgorde aan te passen.</div>
        <div className="flex items-center gap-2">
          {orderChanged && (
            <button onClick={persistOrder} disabled={savingOrder} className="px-3 py-1 bg-green-600 text-white rounded">{savingOrder ? 'Opslaan...' : 'Opslaan volgorde'}</button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        {/* Render rows with placeholder when dragging to create shifting visual */}
        {(() => {
          const renderRow = (f: any, displayNumber: number, originalIndex: number) => (
            <div
              key={f.id}
              onDragOver={onDragOver}
              onDrop={(e) => onDrop(e, f.id)}
              className={`bg-white border border-slate-200 rounded p-4 flex items-start justify-between transition-opacity ${draggingId === f.id ? 'opacity-60' : 'opacity-100'}`}
            >
              <div className="flex items-start gap-3 flex-1">
                <div
                  draggable
                  onDragStart={(e) => onDragStart(e, f.id)}
                  onDragEnd={onDragEnd}
                  onDragEnter={(e) => onDragEnter(e, originalIndex)}
                  className="cursor-grab p-2 rounded hover:bg-slate-50"
                  aria-label="Drag handle"
                >
                  <GripVertical className="w-4 h-4 text-slate-400" />
                </div>

                <div>
                  <div className="font-medium text-slate-900">{f.question}</div>
                  <div className="text-sm text-slate-600 mt-1 whitespace-pre-wrap">{f.answer}</div>
                  <div className="text-xs text-slate-500 mt-2">Status: {f.is_active ? 'Actief' : 'Inactief'}</div>
                </div>
              </div>

              <div className="flex flex-col items-end gap-2 ml-4">
                <div className="text-xs text-slate-400 mb-1">#{displayNumber}</div>
                <button onClick={() => beginEdit(f)} className="px-3 py-1 border rounded flex items-center gap-2">
                  <Edit className="w-4 h-4" /> Bewerken
                </button>
                <button
                  onClick={() => confirmOrArmDelete(f.id, () => remove(f.id))}
                  className={`px-3 py-1 border rounded text-red-600 flex items-center gap-2 ${
                    isDeleteArmed(f.id) ? 'ring-2 ring-red-200' : ''
                  }`}
                  title={isDeleteArmed(f.id) ? 'Klik opnieuw om te verwijderen' : 'Verwijder'}
                >
                  {isDeleteArmed(f.id) ? <Check className="w-4 h-4" /> : <Trash className="w-4 h-4" />}
                  {isDeleteArmed(f.id) ? 'Bevestig' : 'Verwijder'}
                </button>
              </div>
            </div>
          )

          if (!draggingId) {
            return faqs.map((f, idx) => renderRow(f, idx + 1, idx))
          }

          // When dragging, exclude the dragged element and insert a placeholder at hoverIndex
          const visible = faqs.filter(f => f.id !== draggingId)
          const insertAt = hoverIndex !== null ? hoverIndex : visible.length

          const rows: JSX.Element[] = []
          let displayCounter = 1
          for (let i = 0; i <= visible.length; i++) {
            if (i === insertAt) {
              rows.push(
                <div key={`placeholder`} className="h-12 border-2 border-dashed border-slate-200 rounded my-1 bg-slate-50" />
              )
              displayCounter++
            }
            if (i < visible.length) {
              rows.push(renderRow(visible[i], displayCounter, faqs.findIndex(x => x.id === visible[i].id)))
              displayCounter++
            }
          }

          return rows
        })()}
      </div>

      {open && (
        <Modal isOpen={open} onClose={() => setOpen(false)} ariaLabel="FAQ bewerken">
          <div className="p-4">
            <h3 className="text-lg font-semibold mb-2">{editing ? 'FAQ bewerken' : 'Nieuwe FAQ'}</h3>
            <label className="block text-sm text-slate-700">Vraag</label>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} className="w-full px-3 py-2 border rounded mb-3" />

            <label className="block text-sm text-slate-700">Antwoord (tekst/HTML)</label>
            <textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={6} className="w-full px-3 py-2 border rounded mb-3" />

            <div className="flex items-center gap-3 mb-3">
              <input id="active" type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
              <label htmlFor="active" className="text-sm text-slate-700">Actief tonen op de publieke FAQ</label>
            </div>

            <div className="flex justify-end gap-3">
              <button onClick={save} className="px-4 py-2 bg-purple-600 text-white rounded">Opslaan</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
