'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { isAmproProfileComplete, parseAmproFormFields, type AmproFormField } from '@/lib/ampro'
import { useNotification } from '@/contexts/NotificationContext'
import { isISODatePast } from '@/lib/formatting'

type Programma = {
  id: string
  title: string
  applications_open: boolean
  application_deadline: string | null
}

type FormRow = {
  id: string
  name: string
  fields_json: any
}

type ApplicationRow = {
  id: string
  status: 'pending' | 'accepted' | 'rejected' | 'maybe'
  answers_json: any
}

type ProfileRow = {
  first_name: string | null
  last_name: string | null
  phone: string | null
  birth_date: string | null
  street: string | null
  house_number: string | null
  house_number_addition: string | null
  postal_code: string | null
  city: string | null
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: AmproFormField
  value: any
  onChange: (value: any) => void
}) {
  const common = 'h-11 rounded-lg border border-slate-200 bg-white px-3 text-sm'

  if (field.type === 'textarea') {
    return (
      <textarea
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-28 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        placeholder={field.placeholder}
        required={Boolean(field.required)}
      />
    )
  }

  if (field.type === 'select') {
    return (
      <select
        value={typeof value === 'string' ? value : ''}
        onChange={(e) => onChange(e.target.value)}
        className={common}
        required={Boolean(field.required)}
      >
        <option value="">Selecteer…</option>
        {field.options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    )
  }

  if (field.type === 'checkbox') {
    return (
      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
          className="h-4 w-4 rounded border-slate-300"
        />
        <span>{field.label}</span>
      </label>
    )
  }

  return (
    <input
      type={field.type === 'date' ? 'date' : 'text'}
      value={typeof value === 'string' ? value : ''}
      onChange={(e) => onChange(e.target.value)}
      className={common}
      placeholder={field.placeholder}
      required={Boolean(field.required)}
    />
  )
}

export default function AmproProgrammaApplyPage() {
  const params = useParams()
  const router = useRouter()
  const { showSuccess, showError } = useNotification()
  const programmaId = useMemo(() => String((params as any)?.programmaId || ''), [params])

  const [checking, setChecking] = useState(true)
  const [programma, setProgramma] = useState<Programma | null>(null)
  const [form, setForm] = useState<FormRow | null>(null)
  const [fields, setFields] = useState<AmproFormField[]>([])
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [existing, setExisting] = useState<ApplicationRow | null>(null)
  const [saving, setSaving] = useState(false)
  const [mustCompleteProfile, setMustCompleteProfile] = useState(false)
  const [profile, setProfile] = useState<ProfileRow | null>(null)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        setChecking(true)

        const { data: sessionData } = await supabase.auth.getSession()
        const user = sessionData?.session?.user
        if (!user) {
          router.replace(`/ampro/login?next=${encodeURIComponent(`/ampro/programmas/${programmaId}/apply`)}`)
          return
        }

        // Require profile completeness before allowing inschrijving.
        const profileResp = await supabase
          .from('ampro_dancer_profiles')
          .select('first_name,last_name,phone,birth_date,street,house_number,house_number_addition,postal_code,city')
          .eq('user_id', user.id)
          .maybeSingle()

        if (profileResp.error) throw profileResp.error
        const okProfile = isAmproProfileComplete(profileResp.data as any)
        if (!okProfile) {
          if (!cancelled) setMustCompleteProfile(true)
          return
        }

        const perfResp = await supabase
          .from('ampro_programmas')
          .select('id,title,applications_open,application_deadline')
          .eq('id', programmaId)
          .maybeSingle()

        if (perfResp.error) throw perfResp.error
        if (!perfResp.data?.id) {
          router.replace('/ampro/programmas')
          return
        }

        const formLinkResp = await supabase
          .from('ampro_performance_forms')
          .select('form_id')
          .eq('performance_id', programmaId)
          .maybeSingle()

        if (formLinkResp.error) throw formLinkResp.error

        let formRow: FormRow | null = null
        if (formLinkResp.data?.form_id) {
          const formResp = await supabase
            .from('ampro_forms')
            .select('id,name,fields_json')
            .eq('id', formLinkResp.data.form_id)
            .maybeSingle()
          if (formResp.error) throw formResp.error
          if (formResp.data?.id) formRow = formResp.data as any
        }

        const appResp = await supabase
          .from('ampro_applications')
          .select('id,status,answers_json')
          .eq('performance_id', programmaId)
          .eq('user_id', user.id)
          .maybeSingle()

        if (appResp.error) throw appResp.error

        const parsedFields = parseAmproFormFields(formRow?.fields_json)

        if (!cancelled) {
          setProfile((profileResp.data as any) || null)
          setProgramma(perfResp.data as any)
          setForm(formRow)
          setFields(parsedFields)
          setExisting((appResp.data as any) || null)
          setAnswers((appResp.data as any)?.answers_json || {})
        }
      } catch (e: any) {
        if (!cancelled) showError(e?.message || 'Kon inschrijfformulier niet laden')
      } finally {
        if (!cancelled) setChecking(false)
      }
    })()

    return () => {
      cancelled = true
    }
  }, [programmaId, router])

  async function submit() {
    try {
      setSaving(true)

      const { data: sessionData } = await supabase.auth.getSession()
      const user = sessionData?.session?.user
      if (!user) throw new Error('Je bent niet ingelogd')

      if (mustCompleteProfile) {
        throw new Error('Vul eerst je profiel volledig in om in te schrijven')
      }

      if (!programma?.applications_open) {
        throw new Error('Inschrijvingen zijn gesloten voor dit programma')
      }

      if (isISODatePast(programma?.application_deadline)) {
        throw new Error('Inschrijvingen zijn gesloten voor dit programma')
      }

      if (existing && existing.status !== 'pending') {
        const s = String(existing.status || '').toLowerCase()
        if (s === 'accepted' || s === 'rejected') {
          throw new Error('Je inschrijving is al beoordeeld en kan niet meer aangepast worden')
        }
        throw new Error('Je inschrijving wordt momenteel beoordeeld en kan tijdelijk niet aangepast worden')
      }

      const missingRequiredLabels = fields
        .filter((f) => Boolean((f as any)?.required))
        .filter((f) => {
          const v = (answers as any)[f.key]
          if (f.type === 'checkbox') return !Boolean(v)
          return !(typeof v === 'string' && v.trim().length > 0)
        })
        .map((f) => f.label)

      if (missingRequiredLabels.length) {
        throw new Error(`Vul alle verplichte velden in: ${missingRequiredLabels.join(', ')}`)
      }

      const latestProfileResp = await supabase
        .from('ampro_dancer_profiles')
        .select('first_name,last_name,phone,birth_date,street,house_number,house_number_addition,postal_code,city')
        .eq('user_id', user.id)
        .maybeSingle()

      if (latestProfileResp.error) throw latestProfileResp.error
      const p = (latestProfileResp.data as any) || profile

      const snapshot = {
        first_name: p?.first_name ?? null,
        last_name: p?.last_name ?? null,
        birth_date: p?.birth_date ?? null,
        email: user.email ?? null,
        phone: p?.phone ?? null,
        street: p?.street ?? null,
        house_number: p?.house_number ?? null,
        house_number_addition: p?.house_number_addition ?? null,
        postal_code: p?.postal_code ?? null,
        city: p?.city ?? null,
      }

      if (existing?.id) {
        const { error } = await supabase
          .from('ampro_applications')
          .update({ answers_json: answers, snapshot_json: snapshot })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('ampro_applications').insert({
          performance_id: programmaId,
          user_id: user.id,
          answers_json: answers,
          snapshot_json: snapshot,
        })
        if (error) throw error
      }

      showSuccess('Inschrijving opgeslagen')

      router.replace('/ampro/user')
    } catch (e: any) {
      showError(e?.message || 'Opslaan mislukt')
    } finally {
      setSaving(false)
    }
  }

  if (checking) return <div className="min-h-screen bg-white" />

  if (mustCompleteProfile) {
    const nextPath = `/ampro/programmas/${encodeURIComponent(programmaId)}/apply`
    return (
      <main className="min-h-screen bg-white">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <Link href={`/ampro/programmas/${encodeURIComponent(programmaId)}`} className="text-sm font-semibold text-slate-900">
            ← Terug
          </Link>

          <h1 className="mt-6 text-2xl font-bold text-slate-900">Profiel onvolledig</h1>
          <p className="mt-2 text-sm text-slate-600">
            Voor je kan inschrijven, moeten je voornaam, achternaam, geboortedatum en adresgegevens ingevuld zijn.
          </p>

          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
            <button
              type="button"
              onClick={() => router.push(`/ampro/profile?next=${encodeURIComponent(nextPath)}`)}
              className="h-11 rounded-lg px-4 text-sm font-semibold transition-colors bg-blue-600 text-white hover:bg-blue-700"
            >
              Ga naar mijn profiel
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="flex items-center justify-between gap-4">
          <Link href={`/ampro/programmas/${encodeURIComponent(programmaId)}`} className="text-sm font-semibold text-slate-900">
            ← Terug
          </Link>
        </div>

        <h1 className="mt-6 text-2xl font-bold text-slate-900">Inschrijven</h1>
        {programma ? <p className="mt-1 text-sm text-slate-600">Voor: {programma.title}</p> : null}

        <div className="mt-6 rounded-xl border border-slate-200 bg-white p-6">
          <div className="text-sm font-semibold text-slate-900">Formulier</div>
          <div className="mt-1 text-sm text-slate-600">{form?.name || 'Standaard inschrijving'}</div>

          <div className="mt-6 grid gap-4">
            {fields.length === 0 ? (
              <div className="text-sm text-slate-700">Nog geen form fields ingesteld. (Admin kan dit straks beheren.)</div>
            ) : null}

            {fields.map((field) => {
              if (field.type === 'checkbox') {
                return (
                  <div key={field.key} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                    <FieldInput
                      field={field}
                      value={answers[field.key]}
                      onChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}
                    />
                  </div>
                )
              }

              return (
                <label key={field.key} className="grid gap-1 text-sm font-medium text-slate-700">
                  {field.label}
                  <FieldInput
                    field={field}
                    value={answers[field.key]}
                    onChange={(v) => setAnswers((a) => ({ ...a, [field.key]: v }))}
                  />
                </label>
              )
            })}

            <button
              onClick={submit}
              disabled={saving}
              className={`h-11 rounded-lg px-4 text-sm font-semibold transition-colors ${
                saving ? 'bg-blue-100 text-blue-400' : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {saving ? 'Opslaan…' : 'Verstuur inschrijving'}
            </button>
          </div>
        </div>
      </div>
    </main>
  )
}
