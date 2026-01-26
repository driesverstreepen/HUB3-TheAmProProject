import React, { useRef, useEffect, useState } from 'react'
import { CheckCircle, Calendar, Clock, FileText, CreditCard, Settings, Users, Building2 } from 'lucide-react'

const iconMap: Record<string, React.FC<any>> = {
  CheckCircle,
  Calendar,
  Clock,
  FileText,
  CreditCard,
  Settings,
  Users,
  Building2,
}

interface FeatureCardProps {
  title: string
  description: string
  iconName?: string
  index?: number
}

export const FeatureCard: React.FC<FeatureCardProps> = ({ title, description, iconName = 'CheckCircle', index = 0 }) => {
  const Icon = iconMap[iconName] || CheckCircle
  const ref = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setVisible(true)
            obs.unobserve(entry.target)
          }
        })
      },
      { threshold: 0.15 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  // stagger delay per index (ms) — increased so the stagger is clearly visible
  const delay = index * 250

  return (
    <div className="rounded-2xl p-6 h-full bg-white border border-slate-100 hover:-translate-y-2 hover:shadow-xl transition-transform">
      <div
        ref={ref}
        style={{ transitionDelay: `${delay}ms` }}
        className={
          `transform transition-all duration-900 ease-out ` +
          (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4')
        }
      >
        <div className="flex items-start gap-4">
          <div className="shrink-0 flex items-center justify-center w-12 h-12 rounded-lg bg-linear-to-br from-blue-500 to-blue-600 text-white transition-transform duration-200">
            <Icon className="w-6 h-6" />
          </div>
          <div className="min-w-0">
            <h3 className="t-h4 font-semibold mb-1">{title}</h3>
            <p className="t-bodySm">{description}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
