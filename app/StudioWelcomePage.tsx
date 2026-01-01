"use client"

import React from 'react'
import { Building2, ArrowRight, Check, CheckCircle, Sparkles, Calendar, DollarSign, Users, BarChart3, FileText, Clock, Mail, Lock, User, Shield, Zap, TrendingUp } from 'lucide-react'
import { FeatureCard } from '@/components/FeatureCard'
import { PublicNavigation } from '@/components/PublicNavigation'
import Link from 'next/link'
import { PublicAuthModals } from '@/components/public/PublicAuthModals'

export default function StudioWelcomePage() {
  return (
    <PublicAuthModals defaultSignupMode="studio">
      {({ openLogin, openSignupStudio }) => (
        <div className="min-h-screen bg-slate-50 overflow-x-hidden">
          <PublicNavigation onLogin={openLogin} onSignup={openSignupStudio} />

      {/* Hero Section */}
      <div className="relative bg-linear-to-br from-blue-600 via-indigo-700 to-purple-800 text-white overflow-hidden">
        <div className="absolute inset-0 opacity-20 bg-[radial-gradient(ellipse_at_top_left,var(--tw-gradient-stops))] from-white to-transparent"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 backdrop-blur-sm bg-white/10 px-4 py-2 rounded-full border border-white/20 mb-6">
              <Sparkles className="w-4 h-4" />
              <span className="m-caption font-medium text-white">De complete studio management oplossing</span>
            </div>

            <h1 className="m-heroTitle font-bold mb-6 leading-tight !text-white">
              Laat je studio groeien met HUB3
            </h1>

            <p className="m-heroSubtitle text-slate-100 mb-8 max-w-3xl mx-auto leading-relaxed">
              Alles wat je nodig hebt om je dansstudio professioneel te beheren. <br className="hidden md:block" />
              Van planning en betalingen tot analytics en groei.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link 
                href="/auth/registreer?signup=studio" 
                className="m-button group px-8 py-4 bg-white text-blue-600 rounded-xl hover:bg-blue-50 font-semibold transition-all shadow-xl hover:shadow-2xl hover:scale-105 flex items-center gap-2"
              >
                Start 14 dagen gratis trial
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Link>

              <a 
                href="#pricing" 
                className="m-button group px-8 py-4 bg-transparent text-white border-2 border-white/40 rounded-xl hover:bg-white/10 font-semibold transition-all shadow-xl hover:shadow-2xl flex items-center gap-2"
              >
                Bekijk prijzen
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>

            <p className="m-bodySm mt-6 text-slate-200">
              💳 Geen creditcard nodig voor trial
            </p>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 h-16 bg-linear-to-t from-slate-50 to-transparent"></div>
      </div>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        {/* Benefits Overview */}
        <section className="mb-24">
          <div className="text-center mb-16">
            <h2 className="m-sectionTitle font-bold text-slate-900 mb-4">Waarom kiezen studio's voor HUB3?</h2>
            <p className="m-bodyLg text-slate-600 max-w-2xl mx-auto">
              Bespaar tijd, verhoog efficiency en laat je studio groeien met de tools die je nodig hebt
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-linear-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Clock className="w-8 h-8 text-white" />
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Bespaar 10+ uur per week</h3>
              <p className="m-body text-slate-600">
                Automatiseer administratie, planning en communicatie. Besteed je tijd aan wat echt belangrijk is: lesgeven.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-linear-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <TrendingUp className="w-8 h-8 text-white" />
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Verhoog je inkomsten</h3>
              <p className="m-body text-slate-600">
                Makkelijke online inschrijvingen, automatische betalingen en betere zichtbaarheid leiden tot meer leden.
              </p>
            </div>

            <div className="bg-white rounded-2xl shadow-lg p-8 border border-slate-200 text-center hover:shadow-xl transition-shadow">
              <div className="w-16 h-16 bg-linear-to-br from-green-500 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
                <Zap className="w-8 h-8 text-white" />
              </div>
              <h3 className="m-cardTitle font-bold text-slate-900 mb-3">Professionele uitstraling</h3>
              <p className="m-body text-slate-600">
                Geef je studio een moderne, professionele uitstraling met een eigen profiel en online booking systeem.
              </p>
            </div>
          </div>
        </section>

        {/* Features Section */}
        <section className="mb-24">
          <div className="text-center mb-16">
            <h2 className="m-sectionTitle font-bold text-slate-900 mb-4">Complete studio management</h2>
            <p className="m-bodyLg text-slate-600 max-w-2xl mx-auto">
              Alles wat je nodig hebt om je studio efficiënt te runnen, in één platform
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            <FeatureCard 
              title="Planning & Roosters" 
              description="Creëer programma's, plan lessen en beheer je docenten met een intuïtief systeem"
              iconName="Calendar"
            />
            <FeatureCard 
              title="Betalingen & Facturatie" 
              description="Automatische betalingen via Stripe, facturen en financiële rapportages"
              iconName="DollarSign"
            />
            <FeatureCard 
              title="Aanwezigheid" 
              description="Digitaal registreren, automatische rapporten en inzicht in aanwezigheidspatronen"
              iconName="Users"
            />
            <FeatureCard 
              title="Analytics & Rapporten" 
              description="Krijg inzicht in bezetting, inkomsten en groei met duidelijke dashboards"
              iconName="BarChart3"
            />
            <FeatureCard 
              title="Ledenadministratie" 
              description="Beheer alle ledengegevens, inschrijvingen en communicatie op één plek"
              iconName="FileText"
            />
            <FeatureCard 
              title="Online Zichtbaarheid" 
              description="Eigen studioprofielpagina waar nieuwe leden je kunnen vinden en inschrijven"
              iconName="Sparkles"
            />
            <FeatureCard 
              title="Team Beheer" 
              description="Voeg docenten en personeel toe met rolgebaseerde toegang en rechten"
              iconName="Shield"
            />
            <FeatureCard 
              title="Communicatie" 
              description="Email notificaties, updates en berichten naar leden en docenten"
              iconName="Mail"
            />
          </div>
        </section>

        {/* Detailed Benefits */}
        <section className="mb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="bg-linear-to-br from-blue-50 to-purple-50 rounded-2xl p-12">
              <div className="bg-white rounded-xl shadow-xl p-8">
                <Building2 className="w-16 h-16 text-blue-600 mb-4" />
                <h3 className="m-cardTitle font-bold text-slate-900 mb-4">Gebouwd voor dansstudio's</h3>
                <p className="m-body text-slate-600 mb-6">
                  HUB3 is speciaal ontworpen voor dansstudio's en begrijpt de unieke uitdagingen van je business.
                </p>
                <ul className="space-y-3">
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="m-body text-slate-700">Beheer meerdere locaties vanuit één account</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="m-body text-slate-700">Flexibele programma's: cursussen, workshops, proeflessen</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="m-body text-slate-700">Integreer je eigen branding en logo</span>
                  </li>
                  <li className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    <span className="m-body text-slate-700">GDPR compliant en veilige data opslag</span>
                  </li>
                </ul>
              </div>
            </div>

            <div>
              <h2 className="m-sectionTitle font-bold text-slate-900 mb-6">Alles wat je nodig hebt</h2>
              <p className="m-bodyLg text-slate-600 mb-8">
                Stop met jongleren tussen verschillende tools en spreadsheets. HUB3 centraliseert alles op één plek.
              </p>

              <div className="space-y-4">
                {[
                  'Realtime lesplanning en updates',
                  'Automatische betalingsverwerking via Stripe',
                  'Digitale aanwezigheidsregistratie',
                  'Rolgebaseerde toegang voor je team',
                  'Financiële rapportages en analytics',
                  'Email notificaties en herinneringen',
                  'Online inschrijfformulieren',
                  'Documenten en contracten centraal opslaan',
                ].map((benefit, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircle className="w-6 h-6 text-blue-600 shrink-0 mt-0.5" />
                    <span className="m-body text-slate-700">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link 
                  href="/auth/registreer?signup=studio"
                  className="m-button inline-flex items-center gap-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-all shadow-lg hover:shadow-xl"
                >
                  Start nu je gratis trial
                  <ArrowRight className="w-5 h-5" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing Section */}
        <section id="pricing" className="mb-24">
          <div className="text-center mb-16">
            <h2 className="m-sectionTitle font-bold text-slate-900 mb-4">Transparante prijzen</h2>
            <p className="m-bodyLg text-slate-600 max-w-2xl mx-auto">
              Kies het plan dat past bij je studio. Upgrade of downgrade op elk moment.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-6xl mx-auto">
            {/* Basic Plan */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-slate-200 hover:border-blue-300 transition-all flex flex-col">
              <div className="text-center mb-6">
                <h3 className="m-sectionTitle font-bold text-slate-900 mb-2">Basic</h3>
                <p className="m-body text-slate-600 mb-4">Perfect voor startende studio's</p>
                <div className="mb-4">
                  <span className="m-sectionTitle font-bold text-slate-900">€5</span>
                  <span className="m-body text-slate-600">/maand</span>
                </div>
                <p className="m-bodySm text-green-600 font-medium">
                  of €50/jaar (bespaar €10)
                </p>
              </div>

              <ul className="space-y-3 flex-grow pb-6">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Tot 50 actieve leden</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Onbeperkt programma's</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Basis planning tools</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Online inschrijvingen</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Email support</span>
                </li>
              </ul>

              <Link 
                href="/auth/registreer?signup=studio&plan=basic"
                className="m-button mt-auto block w-full text-center px-6 py-3 bg-slate-100 text-slate-900 rounded-lg hover:bg-blue-700 text-slate-50 font-semibold transition-colors"
              >
                Kies Basic
              </Link>
            </div>

            {/* Plus Plan */}
            <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-slate-200 hover:border-blue-300 transition-all flex flex-col">

              <div className="text-center mb-6">
                <h3 className="m-sectionTitle font-bold text-slate-900 mb-2">Plus</h3>
                <p className="m-body text-slate-600 mb-4">Voor groeiende studio's</p>
                <div className="mb-4">
                  <span className="m-sectionTitle font-bold text-slate-900">€10</span>
                  <span className="m-body text-slate-600">/maand</span>
                </div>
                <p className="m-bodySm text-green-600 font-medium">
                  of €100/jaar (bespaar €20)
                </p>
              </div>

              <ul className="space-y-3 flex-grow pb-6">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Tot 150 actieve leden</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Alles van Basic</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Geavanceerde analytics</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Automatische betalingen</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Priority support</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Custom branding</span>
                </li>
              </ul>

              <Link 
                href="/auth/registreer?signup=studio&plan=plus"
                className="m-button mt-auto block w-full text-center px-6 py-3 bg-slate-100 text-slate-900 rounded-lg hover:bg-blue-700 text-slate-50 font-semibold transition-colors"
              >
                Kies Plus
              </Link>
            </div>

            {/* Pro Plan */}
            <div className="bg-white rounded-2xl shadow-xl p-8 border-2 border-blue-600 relative hover:shadow-2xl transition-all flex flex-col">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <span className="m-caption bg-blue-600 text-white px-4 py-1 rounded-full font-semibold">
                  Meest gekozen
                </span>
              </div>
              <div className="text-center mb-6">
                <h3 className="m-sectionTitle font-bold text-slate-900 mb-2">Pro</h3>
                <p className="m-body text-slate-600 mb-4">Voor grote studio's</p>
                <div className="mb-4">
                  <span className="m-sectionTitle font-bold text-slate-900">€15</span>
                  <span className="m-body text-slate-600">/maand</span>
                </div>
                <p className="m-bodySm text-green-600 font-medium">
                  of €120/jaar (bespaar €60)
                </p>
              </div>

              <ul className="space-y-3 flex-grow pb-6">
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Onbeperkte leden</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Alles van Plus</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Meerdere locaties</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">API toegang</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Dedicated support</span>
                </li>
                <li className="flex items-start gap-3">
                  <Check className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                  <span className="m-body text-slate-700">Custom integraties</span>
                </li>
              </ul>

              <Link 
                href="/auth/registreer?signup=studio&plan=pro"
                className="m-button mt-auto block w-full text-center px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition-colors shadow-lg"
              >
                Kies Pro
              </Link>
            </div>
          </div>

          <div className="mt-12 text-center">
            <p className="m-body text-slate-600 mb-4">
              Alle plannen komen met een <strong className="text-blue-600">14 dagen gratis trial</strong> — geen creditcard vereist
            </p>
            <p className="m-bodySm text-slate-500">
              Je kunt op elk moment upgraden, downgraden of opzeggen
            </p>
          </div>
        </section>

        {/* CTA Section */}
        <div className="bg-linear-to-r from-slate-900 via-blue-900 to-slate-900 rounded-2xl p-12 text-center text-white shadow-2xl mb-12">
          <h2 className="m-sectionTitle font-bold mb-4 !text-white">Klaar om te starten?</h2>
          <p className="m-bodyLg text-blue-100 mb-8 max-w-2xl mx-auto">
            Sluit je aan bij studio's die HUB3 gebruiken om hun administratie te automatiseren en te groeien
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link 
              href="/auth/registreer?signup=studio"
              className="m-button px-8 py-4 bg-white text-blue-600 rounded-lg hover:bg-blue-50 font-semibold transition-colors shadow-lg"
            >
              Start 14 dagen gratis
            </Link>
            <a 
              href="mailto:info@hub3.nl" 
              className="m-button px-8 py-4 bg-transparent text-white border-2 border-white rounded-lg hover:bg-white/10 font-semibold transition-colors shadow-lg"
            >
              Neem contact op
            </a>
          </div>
        </div>

        {/* Link to user page */}
        <div className="text-center">
          <p className="m-body text-slate-600 mb-4">
            Ben je op zoek naar danslessen? <Link href="/" className="text-blue-600 hover:text-blue-700 font-medium underline">Ontdek HUB3 voor Dansers</Link>
          </p>
        </div>
      </main>
        </div>
      )}
    </PublicAuthModals>
  )
}
