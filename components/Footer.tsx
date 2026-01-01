"use client"

import React from 'react'
// Link not needed here
import ContentContainer from '@/components/ContentContainer'

type FooterProps = {
  title?: string
  contactEmail?: string | null
  actionHref?: string
  actionText?: string
  copyrightName?: string
}

export default function Footer({ title, contactEmail, actionHref, actionText, copyrightName }: FooterProps) {
  const year = new Date().getFullYear()
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white">
      <ContentContainer className="py-8">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div className="flex-1">
            {title ? (
              <h3 className="t-h4 font-bold mb-2">{title}</h3>
            ) : (
              <h3 className="t-h4 font-bold mb-2">HUB3</h3>
            )}
            {contactEmail && <div className="t-bodySm">{contactEmail}</div>}
          </div>

          {actionHref && actionText ? (
            <div>
              <a href={actionHref} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-700 rounded-lg t-button">
                {actionText}
              </a>
            </div>
          ) : null}
        </div>

        <div className="mt-6 pt-6 border-t border-slate-200 text-center">
          <p className="t-caption">© {year} {copyrightName ? copyrightName : (title ? title : 'HUB3')}. All rights reserved.</p>
        </div>
      </ContentContainer>
    </footer>
  )
}
