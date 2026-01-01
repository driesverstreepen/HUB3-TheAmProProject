'use client'

import React from 'react'

type DeviceContextValue = {
  isMobile: boolean
  isTouch: boolean
}

const DeviceContext = React.createContext<DeviceContextValue>({
  isMobile: false,
  isTouch: false,
})

export function DeviceProvider({ children }: { children: React.ReactNode }) {
  const [isMobile, setIsMobile] = React.useState(false)
  const [isTouch, setIsTouch] = React.useState(false)

  React.useEffect(() => {
    try {
      const mq = window.matchMedia('(max-width: 768px)')
      const update = () => setIsMobile(mq.matches)
      update()
      mq.addEventListener?.('change', update)
      // Touch capability detection
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0
      setIsTouch(hasTouch)
      return () => {
        mq.removeEventListener?.('change', update)
      }
    } catch {
      // no-op on SSR or errors
    }
  }, [])

  const value = React.useMemo(() => ({ isMobile, isTouch }), [isMobile, isTouch])

  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>
}

export function useDevice() {
  return React.useContext(DeviceContext)
}
