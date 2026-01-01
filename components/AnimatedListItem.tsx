import React, { useEffect, useRef, useState } from 'react'

interface Props {
  index?: number
  children: React.ReactNode
  className?: string
}

export const AnimatedListItem: React.FC<Props> = ({ index = 0, children, className = '' }) => {
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
      { threshold: 0.12 }
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  const delay = index * 250

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={
        `transform transition-all duration-900 ease-out ` +
        (visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3') +
        ` ${className}`
      }
    >
      {children}
    </div>
  )
}
