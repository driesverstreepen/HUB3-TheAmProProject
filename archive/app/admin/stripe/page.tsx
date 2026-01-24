"use client"

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import { CreditCard, AlertCircle, CheckCircle } from 'lucide-react'
import FormSelect from '@/components/FormSelect'
import SuperAdminSidebar from '@/components/admin/SuperAdminSidebar'
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface StripeConfig {
  id?: string
  stripe_publishable_key: string
  platform_fee_percent: number
  is_live_mode: boolean
  currency: string
}

export default function StripeConfigPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  
  const [config, setConfig] = useState<StripeConfig>({
    stripe_publishable_key: '',
    platform_fee_percent: 10,
    is_live_mode: false,
    currency: 'eur'
  })

  const [secretKey, setSecretKey] = useState('')
  const [webhookSecret, setWebhookSecret] = useState('')

  useEffect(() => {
    checkSuperAdminAndLoadConfig()
  }, [])

  const checkSuperAdminAndLoadConfig = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/auth/login')
        return
      }

      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'super_admin')
        .single()

      if (!roleData) {
        router.push('/')
        return
      }

      setIsSuperAdmin(true)
      await loadConfig()
    } catch (error) {
      console.error('Error checking access:', error)
      router.push('/')
    } finally {
      setLoading(false)
    }
  }

  const loadConfig = async () => {
    try {
      const { data, error } = await supabase
        .from('platform_stripe_config')
        .select('*')
        .single()

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading config:', error)
        return
      }

      if (data) {
        setConfig({
          id: data.id,
          stripe_publishable_key: data.stripe_publishable_key || '',
          platform_fee_percent: data.platform_fee_percent || 10,
          is_live_mode: data.is_live_mode || false,
          currency: data.currency || 'eur'
        })
      }
    } catch (error) {
      console.error('Error loading config:', error)
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)

    try {
      // Note: Secret keys should be encrypted before storing
      // For now, we'll store them via a secure API endpoint
      const response = await fetch('/api/admin/stripe/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...config,
          stripe_secret_key: secretKey || undefined,
          webhook_secret: webhookSecret || undefined
        })
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save configuration')
      }

      setSuccess(true)
      setSecretKey('')
      setWebhookSecret('')
      
      // Reload config
      await loadConfig()
      
      setTimeout(() => setSuccess(false), 3000)
    } catch (error: any) {
      console.error('Error saving config:', error)
      setError(error.message || 'Er is een fout opgetreden')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <LoadingSpinner size={48} label="Laden" indicatorClassName="border-b-purple-600" />
      </div>
    )
  }

  if (!isSuperAdmin) {
    return null
  }

  return (
    <div className="flex min-h-screen bg-slate-50">
      <SuperAdminSidebar />
      
      <div className="flex-1 ml-64">
        <header className="bg-white border-b border-slate-200">
          <div className="px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-purple-600 rounded-xl">
                <CreditCard className="w-8 h-8 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Stripe Configuratie</h1>
                <p className="text-sm text-slate-600">Platform betalingen en Stripe Connect instellingen</p>
              </div>
            </div>
          </div>
        </header>

        <main className="px-8 py-8 max-w-4xl">
          {/* Info Banner */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-xl p-6">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-6 h-6 text-blue-600 mt-1 shrink-0" />
              <div>
                <h3 className="font-semibold text-slate-900 mb-2">Stripe Platform Setup</h3>
                <p className="text-slate-700 leading-relaxed mb-2">
                  Configureer hier je Stripe account voor het platform. Studios kunnen via Stripe Connect 
                  hun eigen betalingen ontvangen, waarbij het platform automatisch een fee inhoudt.
                </p>
                <p className="text-sm text-slate-600">
                  <strong>Let op:</strong> Gebruik eerst test keys om de integratie te testen voordat je live gaat.
                </p>
              </div>
            </div>
          </div>

          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-red-800">
                <AlertCircle className="w-5 h-5" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {success && (
            <div className="mb-6 bg-green-50 border border-green-200 rounded-xl p-4">
              <div className="flex items-center gap-2 text-green-800">
                <CheckCircle className="w-5 h-5" />
                <span>Configuratie succesvol opgeslagen!</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSave} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
            {/* Mode Toggle */}
            <div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.is_live_mode}
                  onChange={(e) => setConfig({ ...config, is_live_mode: e.target.checked })}
                  className="w-5 h-5 text-purple-600 rounded focus:ring-purple-500"
                />
                <div>
                  <span className="font-medium text-slate-900">Live Mode</span>
                  <p className="text-sm text-slate-600">
                    {config.is_live_mode 
                      ? '⚠️ Live modus - echte betalingen worden verwerkt' 
                      : '🧪 Test modus - alleen test betalingen'}
                  </p>
                </div>
              </label>
            </div>

            <div className="border-t border-slate-200"></div>

            {/* Publishable Key */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Publishable Key
                <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={config.stripe_publishable_key}
                onChange={(e) => setConfig({ ...config, stripe_publishable_key: e.target.value })}
                placeholder={config.is_live_mode ? 'pk_live_...' : 'pk_test_...'}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-slate-600">
                Te vinden in Stripe Dashboard → Developers → API keys
              </p>
            </div>

            {/* Secret Key */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Secret Key
                {!config.id && <span className="text-red-500">*</span>}
              </label>
              <input
                type="password"
                required={!config.id}
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                placeholder={config.is_live_mode ? 'sk_live_...' : 'sk_test_...'}
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-slate-600">
                {config.id 
                  ? 'Laat leeg om de bestaande key te behouden' 
                  : 'Wordt versleuteld opgeslagen'}
              </p>
            </div>

            {/* Webhook Secret */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Webhook Secret
              </label>
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                placeholder="whsec_..."
                className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              />
              <p className="mt-1 text-sm text-slate-600">
                Webhook endpoint: <code className="bg-slate-100 px-2 py-1 rounded">{typeof window !== 'undefined' ? window.location.origin : ''}/api/stripe/webhook</code>
              </p>
            </div>

            <div className="border-t border-slate-200"></div>

            {/* Platform Fee */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Platform Fee Percentage
                <span className="text-red-500">*</span>
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  required
                  min="0"
                  max="100"
                  step="0.01"
                  value={config.platform_fee_percent}
                  onChange={(e) => setConfig({ ...config, platform_fee_percent: parseFloat(e.target.value) })}
                  className="w-32 px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                />
                <span className="text-slate-700">%</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Percentage dat het platform inhoudt op elke transactie via studios
              </p>
            </div>

            {/* Currency */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Currency
              </label>
              <FormSelect
                value={config.currency}
                onChange={(e) => setConfig({ ...config, currency: e.target.value })}
                className="w-full"
              >
                <option value="eur">EUR (€)</option>
                <option value="usd">USD ($)</option>
                <option value="gbp">GBP (£)</option>
              </FormSelect>
            </div>

            {/* Save Button */}
            <div className="flex justify-end pt-4">
              <button
                type="submit"
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 font-medium transition-colors"
              >
                {saving ? 'Opslaan...' : 'Configuratie Opslaan'}
              </button>
            </div>
          </form>

          {/* Help Section */}
          <div className="mt-6 bg-slate-100 rounded-xl p-6">
            <h3 className="font-semibold text-slate-900 mb-3">💡 Volgende stappen</h3>
            <ol className="list-decimal list-inside space-y-2 text-slate-700">
              <li>Sla je Stripe keys op (start met test keys)</li>
              <li>Configureer webhook endpoint in Stripe Dashboard</li>
              <li>Test de integratie met een test studio account</li>
              <li>Schakel over naar live mode wanneer klaar</li>
            </ol>
          </div>
        </main>
      </div>
    </div>
  )
}
