"use client";

import { useMemo, useState, useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Settings as SettingsIcon, CreditCard, CheckCircle, XCircle, AlertCircle, ExternalLink, RefreshCw, DollarSign, MapPin, Plus, Edit, Trash2, X, FileText, Info, Shield, Globe, GraduationCap, Users, Crown, ChevronDown, ChevronUp } from 'lucide-react';
import LocationsManagement from './LocationsClient';
import Modal from '@/components/Modal';
import ActionIcon from '@/components/ActionIcon';
import FormSelect from '@/components/FormSelect';
import { supabase } from '@/lib/supabase';
import FormsManagement from './FormsClient';
import FeaturesClient from './FeaturesClient';
import PaymentsClient from './PaymentsClient';
import TeachersClient from './TeachersClient';
import TeamClient from './TeamClient';
import SubscriptionClient from './SubscriptionClient';
import { RichTextEditor } from '@/components/RichTextEditor';
import { useNotification } from '@/contexts/NotificationContext';
import { useDevice } from '@/contexts/DeviceContext'
import { useStudioFeatures } from '@/hooks/useStudioFeatures';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import Checkbox from '@/components/Checkbox'
import PushNotificationsToggle from '@/components/PushNotificationsToggle'
import Select from '@/components/Select'
import { useStudioSchoolYears } from '@/hooks/useStudioSchoolYears'

interface Props {
  studioId: string;
}

interface Policy {
  id?: string;
  studio_id: string;
  title: string;
  content: string;
  cancellation_policy?: string | null;
  refund_policy?: string | null;
  cancellation_period_days?: number | null;
  created_at?: string;
  updated_at?: string;
}

const DEFAULT_POLICY_TEMPLATE = `<h1>Studio Policies & Terms</h1>

<p><strong>Important:</strong> Please customize this template with your studio's specific information, including contact details, addresses, and your actual cancellation and refund policies. This template is provided as a starting point and must be reviewed by your legal counsel before publication.</p>

<p>Welcome to [Your Studio Name]! These policies apply to all programs, workshops, classes, and services offered by our studio. By enrolling in any of our offerings, you agree to abide by these terms.</p>

<h2>1. Terms & Conditions</h2>

<h3>1.1 Enrollment & Registration</h3>
<p>Your enrollment is confirmed upon:</p>
<ul>
  <li>Submission and approval of your application</li>
  <li>Payment of applicable fees (if required)</li>
  <li>Acceptance of these policies</li>
</ul>
<p>All information provided during registration must be accurate and up-to-date. You are responsible for notifying us of any changes to your contact information, emergency contacts, or health conditions that may affect participation.</p>

<h3>1.2 Age Requirements</h3>
<p>Participants must meet the age requirements specified for each program. Parents or legal guardians must complete registration for participants under 18 years of age.</p>

<h3>1.3 Attendance & Participation</h3>
<p>Regular attendance and active participation are expected. Please notify us at least 24 hours in advance if you cannot attend a scheduled session. Excessive absences may result in removal from the program without refund.</p>

<h3>1.4 Payment Terms</h3>
<p>Payment is due at the time of enrollment unless otherwise specified. We accept [list payment methods]. Late payments may result in suspension from classes until payment is received. Returned checks will incur an additional fee of [amount].</p>

<h3>1.5 Class Minimums</h3>
<p>Programs require a minimum number of enrolled participants to run. If minimum enrollment is not met, we reserve the right to cancel the program with full refund or offer an alternative.</p>

<h2>2. Cancellation & Refund Policy</h2>

<h3>2.1 Cancellations by Members</h3>
<p><strong>Please note:</strong> Specific cancellation deadlines and refund amounts are configured per program type in your Settings. This is a general overview:</p>
<ul>
  <li><strong>Early cancellation (14+ days before start):</strong> Full refund minus administrative fee</li>
  <li><strong>Standard cancellation (7-14 days before start):</strong> Partial refund as specified</li>
  <li><strong>Late cancellation (less than 7 days before start):</strong> No refund unless exceptional circumstances</li>
</ul>
<p>Cancellation requests must be submitted in writing through your member dashboard or via email to [your email].</p>

<h3>2.2 Cancellations by Studio</h3>
<p>If we must cancel a program due to insufficient enrollment, instructor unavailability, or other circumstances, you will receive:</p>
<ul>
  <li>Full refund of all fees paid</li>
  <li>Option to transfer to another program of equal or lesser value</li>
  <li>Studio credit for future use</li>
</ul>
<p>Refunds will be processed within 10 business days to the original payment method.</p>

<h3>2.3 Medical or Emergency Exceptions</h3>
<p>Medical emergencies or exceptional circumstances will be considered on a case-by-case basis with appropriate documentation (doctor's note, etc.). Please contact us at [your email] to discuss your situation.</p>

<h3>2.4 No-Show Policy</h3>
<p>Participants who miss a session without prior notice ("no-show") are not eligible for makeup classes or refunds for that session.</p>

<h2>3. Privacy Policy & Data Protection</h2>

<h3>3.1 Information We Collect</h3>
<p>We collect and process the following personal information:</p>
<ul>
  <li>Name, email address, phone number</li>
  <li>Birth date and age for age-appropriate program placement</li>
  <li>Address for billing and emergency purposes</li>
  <li>Emergency contact information</li>
  <li>Medical information relevant to safe participation (if provided)</li>
  <li>Payment information (processed securely through Stripe)</li>
</ul>

<h3>3.2 How We Use Your Information</h3>
<p>Your personal information is used for:</p>
<ul>
  <li>Program enrollment and management</li>
  <li>Communication about schedules, updates, and important announcements</li>
  <li>Payment processing</li>
  <li>Emergency contact purposes</li>
  <li>Legal compliance and record-keeping</li>
  <li>Improving our services</li>
</ul>

<h3>3.3 Data Security</h3>
<p>Your information is stored securely using industry-standard encryption and security practices. We never sell your personal information to third parties. Information may be shared only:</p>
<ul>
  <li>With instructors and staff as needed for program delivery</li>
  <li>With payment processors for transaction processing</li>
  <li>As required by law or legal process</li>
  <li>With your explicit consent</li>
</ul>

<h3>3.4 Your Rights</h3>
<p>Under GDPR and applicable data protection laws, you have the right to:</p>
<ul>
  <li>Access your personal data</li>
  <li>Request correction of inaccurate data</li>
  <li>Request deletion of your data (subject to legal retention requirements)</li>
  <li>Export your data in a portable format</li>
  <li>Withdraw consent for non-essential data processing</li>
</ul>
<p>To exercise these rights, contact us at [your email].</p>

<h3>3.5 Data Retention</h3>
<p>We retain your personal information for as long as you have an active account plus [X years] for legal and financial record-keeping purposes. After this period, data is securely deleted or anonymized.</p>

<h2>4. Code of Conduct & Studio Rules</h2>

<h3>4.1 Expected Behavior</h3>
<p>All participants, parents, and visitors must:</p>
<ul>
  <li>Treat instructors, staff, and fellow participants with respect and courtesy</li>
  <li>Follow all safety guidelines and instructor directions</li>
  <li>Arrive on time and prepared for class</li>
  <li>Wear appropriate attire as specified for each program</li>
  <li>Maintain appropriate language and behavior at all times</li>
  <li>Respect studio property, equipment, and facilities</li>
  <li>Keep the studio clean and tidy</li>
</ul>

<h3>4.2 Prohibited Conduct</h3>
<p>The following behaviors are strictly prohibited and may result in immediate removal without refund:</p>
<ul>
  <li>Bullying, harassment, or discrimination of any kind</li>
  <li>Use of alcohol, drugs, or tobacco on studio premises</li>
  <li>Violence or threats of violence</li>
  <li>Theft or damage to property</li>
  <li>Disruptive or dangerous behavior</li>
  <li>Violation of safety protocols</li>
</ul>

<h3>4.3 Dress Code</h3>
<p>[Specify your studio's dress code requirements here, including required attire, shoes, hair requirements, jewelry restrictions, etc.]</p>

<h2>5. Health, Safety & Liability</h2>

<h3>5.1 Health Requirements</h3>
<p>Participants must be in good physical health appropriate for the activities involved. Please inform us of any medical conditions, allergies, injuries, or limitations that may affect participation. We reserve the right to request medical clearance before participation.</p>

<h3>5.2 Assumption of Risk</h3>
<p>Participants acknowledge that dance and physical activities involve inherent risks including, but not limited to, sprains, strains, fractures, and other injuries. By participating, you assume these risks and agree that you are physically capable of participating.</p>

<h3>5.3 Liability Waiver</h3>
<p>To the fullest extent permitted by law, participants (or parents/guardians for minors) agree to release, waive, and hold harmless [Your Studio Name], its owners, instructors, staff, and representatives from any and all liability, claims, demands, or causes of action arising from participation in studio activities, including but not limited to personal injury, property damage, or death.</p>

<h3>5.4 Insurance</h3>
<p>We strongly recommend that all participants maintain appropriate health and accident insurance. The studio carries liability insurance but is not responsible for participants' medical expenses resulting from injuries sustained during programs.</p>

<h3>5.5 Emergency Procedures</h3>
<p>In case of injury or medical emergency, studio staff will:</p>
<ul>
  <li>Provide immediate first aid as trained</li>
  <li>Contact emergency services if necessary</li>
  <li>Attempt to contact emergency contacts</li>
  <li>Follow proper documentation and reporting procedures</li>
</ul>

<h2>6. Photography, Video & Media Consent</h2>

<h3>6.1 Media Recording</h3>
<p>During programs and events, we may take photographs and videos for:</p>
<ul>
  <li>Studio promotional materials (website, social media, brochures)</li>
  <li>Documentation and record-keeping</li>
  <li>Instructional purposes</li>
  <li>Recital/performance recordings</li>
</ul>

<h3>6.2 Your Consent</h3>
<p>By enrolling and accepting these policies, you consent to being photographed or recorded during studio activities. If you wish to opt out, please notify us in writing at [your email]. We will make reasonable efforts to exclude you from promotional materials, though complete exclusion may not be possible in group settings.</p>

<h3>6.3 Personal Recording</h3>
<p>Personal recording of classes by participants or parents may be restricted to protect the privacy of other participants and proprietary choreography. Please ask permission before recording.</p>

<h2>7. Intellectual Property</h2>

<h3>7.1 Choreography & Materials</h3>
<p>All choreography, routines, music selections, class materials, and teaching methods are the intellectual property of [Your Studio Name] and its instructors. Unauthorized recording, reproduction, or sharing is prohibited.</p>

<h3>7.2 Studio Branding</h3>
<p>The studio name, logo, and branding materials are protected trademarks. Use without permission is prohibited.</p>

<h2>8. Studio Policies & Operations</h2>

<h3>8.1 Weather & Closures</h3>
<p>In case of severe weather or emergency situations, studio closures will be announced via [communication method]. Makeup classes may be offered at the studio's discretion.</p>

<h3>8.2 Observation & Waiting Areas</h3>
<p>[Specify your policy on parent observation, waiting areas, and facility access]</p>

<h3>8.3 Dropping Off & Picking Up</h3>
<p>[If applicable, specify policies for child drop-off and pick-up procedures, including timing and authorized persons]</p>

<h2>9. Changes to Policies</h2>

<h3>9.1 Policy Updates</h3>
<p>We reserve the right to modify these policies at any time. Updated policies will be:</p>
<ul>
  <li>Posted on this page with revision date</li>
  <li>Communicated to active members via email</li>
  <li>Effective immediately upon publication unless otherwise stated</li>
</ul>
<p>Continued participation after policy changes constitutes acceptance of the updated terms.</p>

<h3>9.2 Program-Specific Policies</h3>
<p>Individual programs may have additional specific policies or requirements communicated at the time of enrollment. These program-specific policies supplement but do not replace these general studio policies.</p>

<h2>10. Dispute Resolution & Governing Law</h2>

<h3>10.1 Governing Law</h3>
<p>These policies are governed by the laws of [Your Country/State/Province]. Any disputes shall be resolved in the courts of [Your Jurisdiction].</p>

<h3>10.2 Informal Resolution</h3>
<p>In the event of any concerns or disputes, we encourage members to first contact us directly to seek an informal resolution. Most issues can be resolved through open communication.</p>

<h3>10.3 Severability</h3>
<p>If any provision of these policies is found to be unenforceable, the remaining provisions shall remain in full effect.</p>

<h2>11. Contact Information</h2>

<p>For questions, concerns, or to exercise your rights regarding these policies, please contact us:</p>
<ul>
  <li><strong>Studio Address:</strong> [Your Physical Address]</li>
  <li><strong>Email:</strong> [Your Email Address]</li>
  <li><strong>Phone:</strong> [Your Phone Number]</li>
  <li><strong>Website:</strong> [Your Website]</li>
</ul>

<h2>12. Acknowledgment</h2>

<p>By checking the acceptance box during enrollment, you acknowledge that you have read, understood, and agree to abide by all policies outlined in this document. You confirm that all information provided during registration is accurate and complete.</p>

<p><em><strong>Last updated:</strong> ${new Date().toLocaleDateString()}</em></p>
<p><em>Document Version: 1.0</em></p>`;

export default function SettingsClient({ studioId }: Props) {
  const { hasFeature, loading: subscriptionLoading } = useStudioFeatures(studioId);
  const router = useRouter()
  const pathname = usePathname()
  const { isMobile } = useDevice()

  const [active, setActive] = useState<'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications' | 'schoolyears'>('locations');
  const [expandedCategory, setExpandedCategory] = useState<'studio' | 'team' | 'business' | null>('studio')
  const searchParams = useSearchParams()

  const canUseFeaturesTab = hasFeature('member_management');

  const { showSuccess, showError } = useNotification()

  // messages are shown via centralized toasts
  const [loading, setLoading] = useState(true);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [editingPolicy, setEditingPolicy] = useState(false);
  const [policyTitle, setPolicyTitle] = useState('Studio Policies');
  const [policyContent, setPolicyContent] = useState('');
  const [cancellationPolicyContent, setCancellationPolicyContent] = useState('');
  const [refundPolicyContent, setRefundPolicyContent] = useState('');
  const [cancellationPeriodDays, setCancellationPeriodDays] = useState<number | null>(null);
  const [savingPolicy, setSavingPolicy] = useState(false);
  const [cancellationWindowGroupValue, setCancellationWindowGroupValue] = useState<number | null>(null);
  const [cancellationWindowGroupUnit, setCancellationWindowGroupUnit] = useState<'days' | 'hours'>('days');
  const [cancellationWindowWorkshopValue, setCancellationWindowWorkshopValue] = useState<number | null>(null);
  const [cancellationWindowWorkshopUnit, setCancellationWindowWorkshopUnit] = useState<'days' | 'hours'>('days');
  const [cancellationWindowTrialValue, setCancellationWindowTrialValue] = useState<number | null>(null);
  const [cancellationWindowTrialUnit, setCancellationWindowTrialUnit] = useState<'days' | 'hours'>('days');
  const [expandedSection, setExpandedSection] = useState<'general' | 'cancellation' | 'refund' | 'windows' | null>(null);
  const [editingSection, setEditingSection] = useState<'general' | 'cancellation' | 'refund' | 'windows' | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showGenerateConfirm, setShowGenerateConfirm] = useState(false);
  const [showLoadConfirm, setShowLoadConfirm] = useState(false);
  const [lastError, setLastError] = useState<any>(null);
  // raw HTML preview removed — users don't need to see raw HTML

  type StudioChannel = 'none' | 'in_app' | 'push'
  type StudioNotificationPrefs = {
    disable_all: boolean
    enrollment_channel: StudioChannel
    replacement_requests_channel: StudioChannel
  }

  const DEFAULT_STUDIO_NOTIF_PREFS: StudioNotificationPrefs = {
    disable_all: false,
    enrollment_channel: 'push',
    replacement_requests_channel: 'push',
  }

  const [studioNotifLoading, setStudioNotifLoading] = useState(false)
  const [studioNotifSaving, setStudioNotifSaving] = useState(false)
  const [studioNotifPrefs, setStudioNotifPrefs] = useState<StudioNotificationPrefs>(DEFAULT_STUDIO_NOTIF_PREFS)

  const loadStudioNotifPrefs = async () => {
    if (!studioId) return
    setStudioNotifLoading(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes?.user
      if (!user) return

      const { data, error } = await supabase
        .from('studio_notification_preferences')
        .select('disable_all,enrollment_channel,replacement_requests_channel')
        .eq('studio_id', studioId)
        .eq('user_id', user.id)
        .maybeSingle()

      if (error) throw error

      setStudioNotifPrefs({
        ...DEFAULT_STUDIO_NOTIF_PREFS,
        ...(data as any),
      })
    } catch (err: any) {
      // Fallback for older environments where the new table is not yet deployed
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const user = userRes?.user
        if (!user) return

        const { data } = await supabase
          .from('studio_enrollment_notification_preferences')
          .select('disable_all, enrollment_channel')
          .eq('studio_id', studioId)
          .eq('user_id', user.id)
          .maybeSingle()

        setStudioNotifPrefs({
          ...DEFAULT_STUDIO_NOTIF_PREFS,
          disable_all: !!(data as any)?.disable_all,
          enrollment_channel: ((data as any)?.enrollment_channel as any) || 'push',
        })
      } catch (e: any) {
        showError('Laden mislukt: ' + (e?.message || err?.message || String(e) || String(err)))
      }
    } finally {
      setStudioNotifLoading(false)
    }
  }

  const saveStudioNotifPrefs = async () => {
    if (!studioId) return
    setStudioNotifSaving(true)
    try {
      const { data: userRes } = await supabase.auth.getUser()
      const user = userRes?.user
      if (!user) return

      const payload: any = {
        studio_id: studioId,
        user_id: user.id,
        ...studioNotifPrefs,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('studio_notification_preferences')
        .upsert(payload, { onConflict: 'studio_id,user_id' })

      if (error) throw error
      showSuccess('Opgeslagen.')
    } catch (err: any) {
      // Backward compatible fallback: only enrollment preference exists
      try {
        const { data: userRes } = await supabase.auth.getUser()
        const user = userRes?.user
        if (!user) return

        const payload: any = {
          studio_id: studioId,
          user_id: user.id,
          disable_all: !!studioNotifPrefs.disable_all,
          enrollment_channel: studioNotifPrefs.enrollment_channel,
          updated_at: new Date().toISOString(),
        }

        const { error } = await supabase
          .from('studio_enrollment_notification_preferences')
          .upsert(payload, { onConflict: 'studio_id,user_id' })

        if (error) throw error
        showSuccess('Opgeslagen.')
      } catch (e: any) {
        showError('Opslaan mislukt: ' + (e?.message || err?.message || String(e) || String(err)))
      }
    } finally {
      setStudioNotifSaving(false)
    }
  }

 

 
  const loadPolicy = async () => {
    if (!studioId) return;
    setSavingPolicy(false);
    try {
      const { data, error } = await supabase
        .from('studio_policies')
        .select('*')
        .eq('studio_id', studioId)
        .order('version', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        setLastError(error);
        console.error('Error loading policy:', error);
        setPolicy(null);
        setPolicyTitle('Studio Policies');
        setPolicyContent('');
      } else if (data) {
        setLastError(null);
        setPolicy(data as Policy);
        setPolicyTitle((data as Policy).title || 'Studio Policies');
        setPolicyContent((data as Policy).content || '');
        console.info('[Settings] loaded policy content length:', String(((data as Policy).content || '').length));
        setCancellationPolicyContent((data as Policy).cancellation_policy || '');
        setRefundPolicyContent((data as Policy).refund_policy || '');
        setCancellationPeriodDays((data as Policy).cancellation_period_days ?? null);
        setCancellationWindowGroupValue((data as any).cancellation_window_group_value ?? null);
        setCancellationWindowGroupUnit(((data as any).cancellation_window_group_unit as 'days' | 'hours') || 'days');
        setCancellationWindowWorkshopValue((data as any).cancellation_window_workshop_value ?? null);
        setCancellationWindowWorkshopUnit(((data as any).cancellation_window_workshop_unit as 'days' | 'hours') || 'days');
        setCancellationWindowTrialValue((data as any).cancellation_window_trial_value ?? null);
        setCancellationWindowTrialUnit(((data as any).cancellation_window_trial_unit as 'days' | 'hours') || 'days');
      } else {
        setLastError(null);
        setPolicy(null);
        setPolicyTitle('Studio Policies');
        setPolicyContent('');
        setCancellationPolicyContent('');
        setRefundPolicyContent('');
        setCancellationPeriodDays(null);
      }
    } catch (err) {
      setLastError(err);
      console.error('Error loading policy:', err);
    }
  };

  const restoreWindowValues = () => {
    if (!policy) {
      setCancellationWindowGroupValue(null);
      setCancellationWindowGroupUnit('days');
      setCancellationWindowWorkshopValue(null);
      setCancellationWindowWorkshopUnit('days');
      setCancellationWindowTrialValue(null);
      setCancellationWindowTrialUnit('days');
      return;
    }
    setCancellationWindowGroupValue((policy as any).cancellation_window_group_value ?? null);
    setCancellationWindowGroupUnit(((policy as any).cancellation_window_group_unit as 'days' | 'hours') || 'days');
    setCancellationWindowWorkshopValue((policy as any).cancellation_window_workshop_value ?? null);
    setCancellationWindowWorkshopUnit(((policy as any).cancellation_window_workshop_unit as 'days' | 'hours') || 'days');
    setCancellationWindowTrialValue((policy as any).cancellation_window_trial_value ?? null);
    setCancellationWindowTrialUnit(((policy as any).cancellation_window_trial_unit as 'days' | 'hours') || 'days');
  }


  useEffect(() => {
    // Ensure Plus/Pro reliably land on Features after subscription info loads
    if (!subscriptionLoading) {
      const tab = searchParams?.get('tab')
      const hasForcedTab = !!tab && ['payments','features','locations','forms','teachers','legal','team','subscription','notifications'].includes(tab)
      const isStripeRedirect = searchParams?.get('success') === 'true' || searchParams?.get('refresh') === 'true'

      if (!hasForcedTab && !isStripeRedirect) {
        if (canUseFeaturesTab && active === 'locations') setActive('features')
        if (!canUseFeaturesTab && active === 'features') setActive('locations')
      }
    }

    const tab = searchParams?.get('tab')
    if (tab) {
      if (['payments','features','locations','forms','teachers','legal','team','subscription','notifications'].includes(tab)) setActive(tab as any)
    }

    if (searchParams?.get('success') === 'true') {
      // show toast for successful redirect actions
      showSuccess('Actie voltooid.')
      setActive('payments');
      // clear URL param (client-only)
      try { window.history.replaceState({}, '', window.location.pathname); } catch(e) {}
    } else if (searchParams?.get('refresh') === 'true') {
      showSuccess('Voltooi de Stripe onboarding om betalingen te activeren.')
      setActive('payments');
      try { window.history.replaceState({}, '', window.location.pathname); } catch(e) {}
    }
    // simulate initial load complete for now
    setLoading(false);

    

    // if legal tab is active, load policy
    if (active === 'legal' && studioId) {
      loadPolicy();
    }
  }, [searchParams, active, studioId]);

  useEffect(() => {
    // Keep the desktop menu expanded state in sync with the active settings section
    if (active === 'locations' || active === 'features' || active === 'forms' || active === 'legal' || active === 'notifications' || active === 'schoolyears') {
      setExpandedCategory('studio')
    } else if (active === 'team' || active === 'teachers') {
      setExpandedCategory('team')
    } else {
      setExpandedCategory('business')
    }
  }, [active])

  const categoryConfig: Array<{
    key: 'studio' | 'team' | 'business'
    label: string
    items: Array<{
      key: 'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications' | 'schoolyears'
      label: string
      icon: any
      visible?: boolean
    }>
  }> = [
    {
      key: 'studio',
      label: 'Studio',
      items: [
        { key: 'features', label: 'Features', icon: SettingsIcon, visible: canUseFeaturesTab },
        { key: 'forms', label: 'Formulieren', icon: FileText },
        { key: 'locations', label: 'Locaties', icon: MapPin },
        { key: 'schoolyears', label: 'Schooljaren', icon: GraduationCap },
        { key: 'notifications', label: 'Notificaties', icon: Info },
        { key: 'legal', label: 'Beleid & Voorwaarden', icon: Shield },
      ],
    },
    {
      key: 'team',
      label: 'Team',
      items: [
        { key: 'team', label: 'Team', icon: Users },
        { key: 'teachers', label: 'Docenten', icon: GraduationCap },
      ],
    },
    {
      key: 'business',
      label: 'Business',
      items: [
        { key: 'payments', label: 'Betalingen', icon: DollarSign },
        { key: 'subscription', label: 'Abonnement', icon: Crown },
      ],
    },
  ]

  const onNavigateTab = (tab: 'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications' | 'schoolyears') => {
    setActive(tab)
    // Keep URL in sync for refresh/back/forward (desktop menu only uses ?tab)
    try {
      const next = new URLSearchParams(searchParams?.toString())
      next.set('tab', tab)
      router.push(`${pathname}?${next.toString()}`)
    } catch {
      // ignore
    }
  }

  const {
    years: schoolYears,
    activeYear,
    activeYearId,
    selectedYearId: effectiveYearId,
    setActiveYear,
    refresh: refreshSchoolYears,
    loading: schoolYearsLoading,
    missingTable: schoolYearsMissing,
  } = useStudioSchoolYears(studioId)

  const [cloneLabel, setCloneLabel] = useState('')
  const [cloneStartsOn, setCloneStartsOn] = useState('')
  const [cloneEndsOn, setCloneEndsOn] = useState('')
  const [cloneCopyPrograms, setCloneCopyPrograms] = useState(true)
  const [cloneMakeActive, setCloneMakeActive] = useState(true)
  const [cloneGenerateLessons, setCloneGenerateLessons] = useState(true)
  const [cloning, setCloning] = useState(false)

  useEffect(() => {
    // Prefill clone form when opening the tab or when years load.
    if (active !== 'schoolyears') return
    if (cloneLabel || cloneStartsOn || cloneEndsOn) return

    const base = schoolYears.find((y) => y.id === (effectiveYearId || '')) || activeYear
    if (!base?.starts_on || !base?.ends_on) return

    const startYear = Number(String(base.starts_on).slice(0, 4))
    const endYear = Number(String(base.ends_on).slice(0, 4))
    if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return

    setCloneLabel(`${startYear + 1}-${endYear + 1}`)
    setCloneStartsOn(`${startYear + 1}-09-01`)
    setCloneEndsOn(`${endYear + 1}-08-31`)
  }, [active, schoolYears, effectiveYearId, activeYear, cloneLabel, cloneStartsOn, cloneEndsOn])

  const handleCloneSchoolYear = async () => {
    if (!studioId) return
    if (!cloneLabel.trim() || !cloneStartsOn || !cloneEndsOn) {
      showError('Vul label, startdatum en einddatum in.')
      return
    }

    setCloning(true)
    try {
      const { data: sessionData } = await supabase.auth.getSession()
      const token = (sessionData as any)?.session?.access_token as string | undefined
      if (!token) {
        showError('Je bent niet ingelogd.')
        return
      }

      const sourceId = effectiveYearId || activeYearId
      const res = await fetch(`/api/studio/${studioId}/school-years/clone`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          source_school_year_id: sourceId,
          copy_programs: cloneCopyPrograms,
          new_school_year: {
            label: cloneLabel.trim(),
            starts_on: cloneStartsOn,
            ends_on: cloneEndsOn,
            is_active: cloneMakeActive,
          },
          generate_lessons: cloneCopyPrograms ? cloneGenerateLessons : false,
        }),
      })

      const json = await res.json().catch(() => null)
      if (!res.ok) {
        const msg = (json as any)?.details || (json as any)?.error || 'Schooljaar klonen mislukt.'
        showError(String(msg))
        return
      }

      showSuccess(
        cloneCopyPrograms
          ? 'Nieuw schooljaar aangemaakt. Gekopieerde programma’s staan standaard verborgen op je public profile.'
          : 'Nieuw schooljaar aangemaakt.'
      )

      await refreshSchoolYears()
    } catch (e: any) {
      showError(e?.message || 'Schooljaar klonen mislukt.')
    } finally {
      setCloning(false)
    }
  }

  const handleSaveSection = async (section: 'general' | 'cancellation' | 'refund' | 'windows') => {
    if (!studioId) return;
    setSavingPolicy(true);
    try {
      const payload: any = { studio_id: studioId, updated_at: new Date().toISOString() };
      if (section === 'general') {
        if (!policyTitle.trim() || !policyContent) {
          showError('Title and content required')
          setSavingPolicy(false);
          return;
        }
        payload.title = policyTitle.trim();
        // store raw HTML as produced by the RichTextEditor (do not trim/alter HTML)
        payload.content = policyContent;
      } else if (section === 'cancellation') {
        payload.cancellation_policy = cancellationPolicyContent.trim();
        // also persist per-program-type cancellation window settings together with the cancellation policy
        payload.cancellation_period_days = cancellationPeriodDays;
        payload.cancellation_window_group_value = cancellationWindowGroupValue;
        payload.cancellation_window_group_unit = cancellationWindowGroupUnit;
        payload.cancellation_window_workshop_value = cancellationWindowWorkshopValue;
        payload.cancellation_window_workshop_unit = cancellationWindowWorkshopUnit;
        payload.cancellation_window_trial_value = cancellationWindowTrialValue;
        payload.cancellation_window_trial_unit = cancellationWindowTrialUnit;
      } else if (section === 'refund') {
        payload.refund_policy = refundPolicyContent.trim();
      } else if (section === 'windows') {
        payload.cancellation_period_days = cancellationPeriodDays;
        payload.cancellation_window_group_value = cancellationWindowGroupValue;
        payload.cancellation_window_group_unit = cancellationWindowGroupUnit;
        payload.cancellation_window_workshop_value = cancellationWindowWorkshopValue;
        payload.cancellation_window_workshop_unit = cancellationWindowWorkshopUnit;
        payload.cancellation_window_trial_value = cancellationWindowTrialValue;
        payload.cancellation_window_trial_unit = cancellationWindowTrialUnit;
      }

      if (policy && policy.id) {
        const { data: updated, error } = await supabase.from('studio_policies').update(payload).eq('id', policy.id).select().maybeSingle();
        if (error) throw error;
        // prefer returned updated row if available
        if (updated) {
          setPolicy(updated as Policy);
          setPolicyContent((updated as any).content || '');
        }
      } else {
        const insertPayload = { ...payload, title: policyTitle.trim() || 'Studio Policies & Terms', content: policyContent || DEFAULT_POLICY_TEMPLATE, is_active: true };
        const { data: inserted, error } = await supabase.from('studio_policies').insert(insertPayload).select().maybeSingle();
        if (error) throw error;
        if (inserted) {
          setPolicy(inserted as Policy);
          setPolicyContent((inserted as any).content || '');
        }
      }

      showSuccess('Saved.')
      setEditingSection(null);
      await loadPolicy();
    } catch (err: any) {
      console.error('Error saving section:', err);
      showError('Failed to save: ' + (err?.message || String(err)))
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!studioId) return;
    if (!policyTitle.trim() || !policyContent.trim()) {
      showError('Please provide both a title and policy content.')
      return;
    }

    setSavingPolicy(true);

    try {
      const payload: any = {
        studio_id: studioId,
        title: policyTitle.trim(),
        // preserve HTML from the editor
        content: policyContent,
        cancellation_policy: cancellationPolicyContent,
        refund_policy: refundPolicyContent,
        cancellation_period_days: cancellationPeriodDays,
        updated_at: new Date().toISOString(),
      };

      if (policy && policy.id) {
        const { data: updated, error } = await supabase.from('studio_policies').update(payload).eq('id', policy.id).select().maybeSingle();
        if (error) {
          setLastError(error);
          throw error;
        }
        if (updated) {
          setPolicy(updated as Policy);
          setPolicyContent((updated as any).content || '');
        }
      } else {
        const insertPayload = { ...payload, is_active: true };
        const { data: inserted, error } = await supabase.from('studio_policies').insert(insertPayload).select().maybeSingle();
        if (error) {
          setLastError(error);
          throw error;
        }
        if (inserted) {
          setPolicy(inserted as Policy);
          setPolicyContent((inserted as any).content || '');
        }
      }

      setLastError(null);
      showSuccess('Policy saved successfully!')
      setEditingPolicy(false);
      await loadPolicy();
    } catch (error: any) {
      setLastError(error);
      console.error('Error saving policy:', error);
      showError('Failed to save policy: ' + (error.message || 'unknown'))
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleDeletePolicy = async () => {
    if (!policy || !policy.id) return;
    setShowDeleteConfirm(false);
    setSavingPolicy(true);
  try {
      // Delete by both id and studio_id to satisfy RLS rules and avoid accidental cross-studio deletes
        const { data, error } = await supabase
          .from('studio_policies')
        .delete()
        .eq('id', policy.id)
        .eq('studio_id', studioId);

      if (error) {
        setLastError(error);
        throw error;
      }
      // If no rows were deleted, show a helpful message
      if (!data || (Array.isArray(data) && (data as any).length === 0)) {
        setLastError({ message: 'No rows deleted', data });
        showError('Policy not found or you do not have permission to delete it.')
      } else {
        setLastError(null);
        setPolicy(null);
        setPolicyTitle('Studio Policies');
        setPolicyContent('');
        setEditingPolicy(false);
        showSuccess('Policy deleted.')
      }
    } catch (err: any) {
      setLastError(err);
      console.error('Error deleting policy:', err);
      showError('Failed to delete policy: ' + (err?.message || 'unknown'))
    } finally {
      setSavingPolicy(false);
    }
  };

  const generateTemplate = async () => {
    if (!studioId) {
      console.error('[generateTemplate] No studioId provided');
      return;
    }
    setShowGenerateConfirm(false);
    setSavingPolicy(true);
    try {
      // Check authentication first
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        console.error('[generateTemplate] Auth error:', authError);
        throw new Error('Not authenticated');
      }

      // Verify permission using current membership model (owner/admin)
      const { data: membership, error: membershipError } = await supabase
        .from('studio_members')
        .select('role')
        .eq('user_id', user.id)
        .eq('studio_id', studioId)
        .maybeSingle();

      if (membershipError) {
        console.warn('[generateTemplate] Membership lookup failed:', membershipError);
      }

      const isMemberAdmin = membership?.role === 'owner' || membership?.role === 'admin';
      let isOwnerFallback = false;

      if (!isMemberAdmin) {
        const { data: ownedStudio, error: ownedStudioError } = await supabase
          .from('studios')
          .select('id')
          .eq('id', studioId)
          .eq('eigenaar_id', user.id)
          .maybeSingle();

        if (!ownedStudioError && ownedStudio) {
          isOwnerFallback = true;
        }
      }

      if (!isMemberAdmin && !isOwnerFallback) {
        throw new Error('You do not have permission to generate a template for this studio.');
      }

      const payload = {
        studio_id: studioId,
        title: 'Studio Policies & Terms',
        content: DEFAULT_POLICY_TEMPLATE,
        cancellation_policy: `<h3>Cancellation Policy</h3><p>Members may cancel up to 7 days before the program start for a full refund. Cancellations after this period may be subject to partial or no refund as specified by the studio.</p>`,
        refund_policy: `<h3>Refund Policy</h3><p>Refunds will be issued to the original payment method within 10 business days. Exceptions such as medical emergencies are considered on a case-by-case basis.</p>`,
        cancellation_period_days: 7,
        is_active: true,
      };

      console.log('[generateTemplate] Inserting policy with payload:', { ...payload, content: '[TRUNCATED]' });

      const { data, error } = await supabase.from('studio_policies').insert(payload).select();
      
      if (error) {
        console.error('[generateTemplate] Insert error:', error);
        setLastError(error);
        throw error;
      }
      
      console.log('[generateTemplate] Insert successful:', data);
      setLastError(null);
      showSuccess('Template generated and saved.')
      await loadPolicy();
    } catch (err: any) {
      setLastError(err);
      console.error('[generateTemplate] Error generating template:', err);
      showError('Failed to generate template: ' + (err?.message || JSON.stringify(err)))
    } finally {
      setSavingPolicy(false);
    }
  };

  const handleDiscardPolicy = () => {
    if (policy) {
      setPolicyTitle(policy.title || 'Studio Policies');
      setPolicyContent(policy.content || '');
      setCancellationPolicyContent((policy as any).cancellation_policy || '');
      setRefundPolicyContent((policy as any).refund_policy || '');
      setCancellationPeriodDays((policy as any).cancellation_period_days ?? null);
    } else {
      setPolicyTitle('Studio Policies');
      setPolicyContent('');
      setCancellationPolicyContent('');
      setRefundPolicyContent('');
      setCancellationPeriodDays(null);
    }
    setEditingPolicy(false);
  };

  const mobileAccordionGroups = useMemo(() => {
    return [
      {
        key: 'studio' as const,
        label: 'Studio',
        items: [
          ...(canUseFeaturesTab ? [{ key: 'features' as const, label: 'Features', icon: SettingsIcon }] : []),
          { key: 'locations' as const, label: 'Locaties', icon: MapPin },
          { key: 'forms' as const, label: 'Formulieren', icon: FileText },
          { key: 'notifications' as const, label: 'Notificaties', icon: Info },
          { key: 'legal' as const, label: 'Beleid & Voorwaarden', icon: Shield },
        ],
      },
      {
        key: 'team' as const,
        label: 'Team',
        items: [
          { key: 'team' as const, label: 'Team', icon: Users },
          { key: 'teachers' as const, label: 'Docenten', icon: GraduationCap },
        ],
      },
      {
        key: 'business' as const,
        label: 'Business',
        items: [
          { key: 'payments' as const, label: 'Betalingen', icon: DollarSign },
          { key: 'subscription' as const, label: 'Abonnement', icon: Crown },
        ],
      },
    ]
  }, [canUseFeaturesTab])

  const [openMobilePanels, setOpenMobilePanels] = useState<
    Partial<Record<'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications', boolean>>
  >({})
  const [mountedMobilePanels, setMountedMobilePanels] = useState<
    Partial<Record<'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications', boolean>>
  >({})

  const toggleMobilePanel = (key: 'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications') => {
    // Single-open accordion: opening one panel closes the others.
    setOpenMobilePanels((prev) => {
      const isCurrentlyOpen = !!prev?.[key]
      return isCurrentlyOpen ? {} : { [key]: true }
    })
    setMountedMobilePanels((prev) => ({ ...prev, [key]: true }))
  }

  const renderTabContent = (tab: 'features' | 'locations' | 'forms' | 'payments' | 'teachers' | 'team' | 'legal' | 'subscription' | 'notifications') => {
    if (tab === 'notifications') {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden dark:bg-slate-900 dark:border-slate-700/60">
            <div className="p-6 border-b border-slate-200 bg-slate-50 dark:bg-slate-900/60 dark:border-slate-700/60">
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Notificaties</h2>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                Kies voor welke gebeurtenissen je meldingen ontvangt en via welk kanaal.
              </p>
            </div>

            <div className="p-6 space-y-5">
              {studioNotifLoading ? (
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                  <LoadingSpinner size={18} label="Laden" indicatorClassName="border-b-slate-600" />
                  Laden...
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-3">
                    <Checkbox
                      checked={!!studioNotifPrefs.disable_all}
                      onChange={(e) => setStudioNotifPrefs((p) => ({ ...p, disable_all: e.target.checked }))}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100">Alles uitschakelen</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300">Je ontvangt dan geen studio meldingen.</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Nieuwe inschrijvingen</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">Wanneer iemand zich inschrijft voor een programma.</div>

                      <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Kanaal</label>
                      <FormSelect
                        value={studioNotifPrefs.enrollment_channel}
                        onChange={(e) => setStudioNotifPrefs((p) => ({ ...p, enrollment_channel: e.target.value as any }))}
                        disabled={!!studioNotifPrefs.disable_all}
                      >
                        <option value="in_app">In-app</option>
                        <option value="push">Push</option>
                        <option value="none">Geen</option>
                      </FormSelect>
                    </div>

                    <div>
                      <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Vervangingsaanvragen</div>
                      <div className="text-sm text-slate-600 dark:text-slate-300 mb-3">Wanneer er een nieuwe vervangingsaanvraag wordt ingediend.</div>

                      <label className="block text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Kanaal</label>
                      <FormSelect
                        value={studioNotifPrefs.replacement_requests_channel}
                        onChange={(e) => setStudioNotifPrefs((p) => ({ ...p, replacement_requests_channel: e.target.value as any }))}
                        disabled={!!studioNotifPrefs.disable_all}
                      >
                        <option value="in_app">In-app</option>
                        <option value="push">Push</option>
                        <option value="none">Geen</option>
                      </FormSelect>

                      <div className="mt-4">
                        <div className="text-sm font-medium text-slate-900 dark:text-slate-100 mb-1">Push inschakelen (browser)</div>
                        <div className="text-sm text-slate-600 dark:text-slate-300 mb-2">Nodig als je kanaal op Push zet.</div>
                        <PushNotificationsToggle variant="button" />
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-end">
                    <button
                      onClick={saveStudioNotifPrefs}
                      disabled={studioNotifSaving}
                      className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {studioNotifSaving ? 'Opslaan…' : 'Opslaan'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )
    }

    if (tab === 'legal') {
      return (
        <div className="space-y-6">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-6 border-b border-slate-200 bg-slate-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2 className="text-lg font-semibold text-slate-900 mb-2">Studio Policies & Terms</h2>
                  <p className="text-sm text-slate-600 mb-4">
                    Stel uitgebreid beleidsdocumenten op die alle wettelijke vereisten voor uw studio omvatten. Dit beleid wordt aan users getoond op je publiek studio profiel, en tijdens de inschrijving. Deze zijn openbaar toegankelijk.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6">
              <style>{`\
                .policy-preview { font-size: 1rem; }\n\
                .policy-preview h1 { font-size: 2rem; line-height: 1.15; margin: 0 0 0.75rem; font-weight: 700; }\n\
                .policy-preview h2 { font-size: 1.375rem; line-height: 1.2; margin: 0.75rem 0 0.5rem; font-weight: 600; }\n\
                .policy-preview h3 { font-size: 1.125rem; margin: 0.5rem 0; font-weight: 600; }\n\
                .policy-preview p { margin: 0 0 0.75rem; line-height: 1.8; }\n\
                .policy-preview ul { margin: 0.5rem 0 1rem; padding-left: 1.4rem; }\n\
                .policy-preview li { margin: 0.25rem 0; }\n\
              `}</style>
              {!editingPolicy ? (
                <div>
                  {policy ? (
                    <div>
                      <div className="space-y-4">
                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">{policy.title || 'Studio Policies & Terms'}</h3>
                              <p className="text-sm text-slate-500">Main policy document — Last updated: {policy.updated_at ? new Date(policy.updated_at).toLocaleString() : policy.created_at ? new Date(policy.created_at).toLocaleString() : 'Unknown'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <ActionIcon title="Bewerk beleid" onClick={() => setEditingSection('general')}>
                                <Edit size={18} />
                              </ActionIcon>
                              <button onClick={() => setExpandedSection(expandedSection === 'general' ? null : 'general')} className="text-sm text-slate-500 hover:text-slate-700">{expandedSection === 'general' ? 'Collapse' : 'Preview'}</button>
                            </div>
                          </div>
                          {expandedSection === 'general' && (
                            <div className="mt-4">
                              <div className="prose prose-slate lg:prose-lg max-w-none p-4 bg-white border border-slate-100 rounded-lg max-h-72 overflow-y-auto policy-preview" dangerouslySetInnerHTML={{ __html: policy.content || '' }} />
                              {/* raw HTML preview removed */}
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">Cancellation Policy</h3>
                              <p className="text-sm text-slate-500">Shown during cancellation flow — Last updated: {policy.updated_at ? new Date(policy.updated_at).toLocaleString() : policy.created_at ? new Date(policy.created_at).toLocaleString() : 'Unknown'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <ActionIcon title="Bewerk annuleringsbeleid" onClick={() => setEditingSection('cancellation')}>
                                <Edit size={18} />
                              </ActionIcon>
                              <button onClick={() => setExpandedSection(expandedSection === 'cancellation' ? null : 'cancellation')} className="text-sm text-slate-500 hover:text-slate-700">{expandedSection === 'cancellation' ? 'Collapse' : 'Preview'}</button>
                            </div>
                          </div>
                          {expandedSection === 'cancellation' && (
                            <div className="mt-4">
                              <div className="prose prose-slate lg:prose-md max-w-none p-4 bg-white border border-slate-100 rounded-lg max-h-72 overflow-y-auto policy-preview" dangerouslySetInnerHTML={{ __html: (policy as any).cancellation_policy || '' }} />
                              {/* raw HTML preview removed */}
                            </div>
                          )}
                        </div>

                        <div className="bg-white p-4 rounded-lg border border-slate-200">
                          <div className="flex items-start justify-between">
                            <div>
                              <h3 className="text-lg font-semibold text-slate-900">Refund Policy</h3>
                              <p className="text-sm text-slate-500">How refunds are processed — Last updated: {policy.updated_at ? new Date(policy.updated_at).toLocaleString() : policy.created_at ? new Date(policy.created_at).toLocaleString() : 'Unknown'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <ActionIcon title="Bewerk terugbetalingsbeleid" onClick={() => setEditingSection('refund')}>
                                <Edit size={18} />
                              </ActionIcon>
                              <button onClick={() => setExpandedSection(expandedSection === 'refund' ? null : 'refund')} className="text-sm text-slate-500 hover:text-slate-700">{expandedSection === 'refund' ? 'Collapse' : 'Preview'}</button>
                            </div>
                          </div>
                          {expandedSection === 'refund' && (
                            <div className="mt-4">
                              <div className="prose prose-slate lg:prose-md max-w-none p-4 bg-white border border-slate-100 rounded-lg max-h-72 overflow-y-auto policy-preview" dangerouslySetInnerHTML={{ __html: (policy as any).refund_policy || '' }} />
                              {/* raw HTML preview removed */}
                            </div>
                          )}
                        </div>
                      </div>

                      <Modal isOpen={!!editingSection} onClose={() => setEditingSection(null)} ariaLabel="Edit policy">
                        <div>
                          <h3 className="text-lg font-semibold text-slate-900 mb-2">{editingSection === 'general' ? 'Edit Studio Policies & Terms' : editingSection === 'cancellation' ? 'Edit Cancellation Policy' : 'Edit Refund Policy'}</h3>
                          <div className="mb-4">
                            <RichTextEditor
                              value={editingSection === 'general' ? policyContent : editingSection === 'cancellation' ? cancellationPolicyContent : refundPolicyContent}
                              onChange={editingSection === 'general' ? setPolicyContent : editingSection === 'cancellation' ? setCancellationPolicyContent : setRefundPolicyContent}
                            />
                          </div>

                          {editingSection === 'cancellation' && (
                            <div className="mb-4 border-t pt-4">
                              <h4 className="text-sm font-semibold mb-3">Annuleringsvenster per programma-type</h4>
                              <p className="text-sm text-slate-600 mb-3">Stel in hoeveel tijd vóór de start van een programma leden zich kunnen annuleren. Dit kan per programma-type verschillen.</p>

                              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                  <label className="block text-xs text-slate-700 mb-1">Cursus (groepsles) - waarde</label>
                                  <input type="number" min={0} value={cancellationWindowGroupValue ?? ''} onChange={(e) => setCancellationWindowGroupValue(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-transform duration-150 ease-in-out focus:scale-105" />
                                  <label className="block text-xs text-slate-700 mt-2">Eenheid</label>
                                  <div>
                                    <FormSelect value={cancellationWindowGroupUnit} onChange={(e) => setCancellationWindowGroupUnit(e.target.value as 'days' | 'hours')} className="w-full" variant="sm">
                                      <option value="days">Dagen</option>
                                      <option value="hours">Uren</option>
                                    </FormSelect>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs text-slate-700 mb-1">Workshop - waarde</label>
                                  <input type="number" min={0} value={cancellationWindowWorkshopValue ?? ''} onChange={(e) => setCancellationWindowWorkshopValue(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-transform duration-150 ease-in-out focus:scale-105" />
                                  <label className="block text-xs text-slate-700 mt-2">Eenheid</label>
                                  <div>
                                    <FormSelect value={cancellationWindowWorkshopUnit} onChange={(e) => setCancellationWindowWorkshopUnit(e.target.value as 'days' | 'hours')} className="w-full" variant="sm">
                                      <option value="days">Dagen</option>
                                      <option value="hours">Uren</option>
                                    </FormSelect>
                                  </div>
                                </div>

                                <div>
                                  <label className="block text-xs text-slate-700 mb-1">Proefles / Trial - waarde</label>
                                  <input type="number" min={0} value={cancellationWindowTrialValue ?? ''} onChange={(e) => setCancellationWindowTrialValue(e.target.value === '' ? null : parseInt(e.target.value, 10))} className="w-full px-3 py-2 border border-slate-200 rounded-md text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-transform duration-150 ease-in-out focus:scale-105" />
                                  <label className="block text-xs text-slate-700 mt-2">Eenheid</label>
                                  <div>
                                    <FormSelect value={cancellationWindowTrialUnit} onChange={(e) => setCancellationWindowTrialUnit(e.target.value as 'days' | 'hours')} className="w-full" variant="sm">
                                      <option value="days">Dagen</option>
                                      <option value="hours">Uren</option>
                                    </FormSelect>
                                  </div>
                                </div>
                              </div>

                              {/* Removed individual restore/save buttons; saving is done via the modal's main Save button */}
                            </div>
                          )}

                          <div className="flex justify-end gap-3">
                            <button onClick={() => { if (editingSection) handleSaveSection(editingSection); }} disabled={savingPolicy} className="px-4 py-2 bg-blue-600 text-white rounded-lg">{savingPolicy ? 'Opslaan...' : 'Opslaan'}</button>
                          </div>
                        </div>
                      </Modal>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-slate-900 mb-2">No Policy Yet</h3>
                      <p className="text-slate-600 mb-6 max-w-md mx-auto">Create your studio's policy document to ensure legal compliance and inform members about your terms.</p>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => {
                            setPolicyTitle('Studio Policies & Terms');
                            setPolicyContent('');
                            setEditingPolicy(true);
                          }}
                          className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                        >
                          <FileText size={18} />
                          Start From Scratch
                        </button>
                        <button
                          onClick={() => setShowGenerateConfirm(true)}
                          disabled={savingPolicy}
                          className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
                        >
                          <FileText size={18} />
                          Generate Template
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div>
                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Policy Title *</label>
                    <input
                      type="text"
                      value={policyTitle}
                      onChange={(e) => setPolicyTitle(e.target.value)}
                      className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none text-lg font-semibold"
                      placeholder="e.g., Studio Policies & Terms"
                      required
                    />
                  </div>

                  <div className="mb-6">
                    <div className="flex items-center justify-between mb-2">
                      <label className="block text-sm font-semibold text-slate-900">Policy Content *</label>
                      {!policy && (
                        <button
                          type="button"
                          onClick={() => setShowLoadConfirm(true)}
                          className="text-sm text-green-600 hover:text-green-700 font-medium flex items-center gap-2"
                        >
                          <FileText size={16} />
                          Load Template
                        </button>
                      )}
                    </div>
                    <RichTextEditor
                      value={policyContent}
                      onChange={setPolicyContent}
                      placeholder="Enter your studio's complete policy document. Include Terms & Conditions, Privacy Policy, Cancellation Policy, and Refund Policy..."
                    />
                    <p className="text-xs text-slate-500 mt-2">Use the formatting tools above to create headings, lists, and emphasis. Members will see this policy before enrollment.</p>
                  </div>

                  <div className="mb-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-semibold text-slate-900">Cancellation Policy (members)</label>
                        <span className="text-xs text-slate-500">Shown during cancellation flow</span>
                      </div>
                      <RichTextEditor
                        value={cancellationPolicyContent}
                        onChange={setCancellationPolicyContent}
                        placeholder="Specific cancellation policy details for members"
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-semibold text-slate-900">Refund Policy</label>
                        <span className="text-xs text-slate-500">How refunds are processed</span>
                      </div>
                      <RichTextEditor
                        value={refundPolicyContent}
                        onChange={setRefundPolicyContent}
                        placeholder="Specific refund policy details"
                      />
                    </div>
                  </div>

                  <div className="mb-6">
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Cancellation window (days)</label>
                    <div className="flex items-center gap-3">
                      <input
                        type="number"
                        min={0}
                        value={cancellationPeriodDays ?? ''}
                        onChange={(e) => setCancellationPeriodDays(e.target.value === '' ? null : parseInt(e.target.value, 10))}
                        className="w-32 px-3 py-2 border border-slate-300 rounded-lg"
                        placeholder="7"
                      />
                      <p className="text-sm text-slate-500">Number of days before program start when members can still cancel.</p>
                    </div>
                  </div>

                  <div className="flex gap-3 pt-4 border-t border-slate-200">
                    <button
                      onClick={handleSavePolicy}
                      disabled={savingPolicy}
                      className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {savingPolicy ? (
                        <span className="flex items-center gap-2">
                          <LoadingSpinner size={18} label="Saving" indicatorClassName="border-b-white" />
                          <span>Saving...</span>
                        </span>
                      ) : (
                        <span>Save Policy</span>
                      )}
                    </button>
                    <button
                      onClick={handleDiscardPolicy}
                      disabled={savingPolicy}
                      className="flex items-center gap-2 px-6 py-3 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors font-medium"
                    >
                      <X size={18} />
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Confirmation Modals */}
          {showDeleteConfirm && (
            <div onClick={() => setShowDeleteConfirm(false)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
              <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Delete Policy?</h3>
                  <button onClick={() => setShowDeleteConfirm(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <p className="text-slate-600 mb-6">Are you sure you want to delete this policy? This action cannot be undone.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowDeleteConfirm(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  <button onClick={handleDeletePolicy} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors">Delete</button>
                </div>
              </div>
            </div>
          )}

          {showGenerateConfirm && (
            <div onClick={() => setShowGenerateConfirm(false)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
              <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Generate Template?</h3>
                  <button onClick={() => setShowGenerateConfirm(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <p className="text-slate-600 mb-6">This will create a comprehensive policy template that you can customize for your studio. The template includes Terms & Conditions, Privacy Policy, and other standard sections.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowGenerateConfirm(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  <button onClick={generateTemplate} className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors">Generate</button>
                </div>
              </div>
            </div>
          )}

          {showLoadConfirm && (
            <div onClick={() => setShowLoadConfirm(false)} className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50">
              <div onClick={(e) => e.stopPropagation()} className="bg-white rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-lg font-semibold text-slate-900">Load Template?</h3>
                  <button onClick={() => setShowLoadConfirm(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                    <X size={18} />
                  </button>
                </div>
                <p className="text-slate-600 mb-6">This will replace your current content with the policy template. Any unsaved changes will be lost.</p>
                <div className="flex gap-3 justify-end">
                  <button onClick={() => setShowLoadConfirm(false)} className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
                  <button
                    onClick={() => {
                      setPolicyContent(DEFAULT_POLICY_TEMPLATE);
                      setShowLoadConfirm(false);
                    }}
                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Load Template
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )
    }

    if (tab === 'locations') return <LocationsManagement studioId={studioId} />
    if (tab === 'features') return <FeaturesClient studioId={studioId} />
    if (tab === 'team') return <TeamClient studioId={studioId} />
    if (tab === 'forms') return <FormsManagement studioId={studioId} />
    if (tab === 'teachers') return <TeachersClient studioId={studioId} />
    if (tab === 'subscription') return <SubscriptionClient studioId={studioId} />
    return <PaymentsClient studioId={studioId} />
  }

  useEffect(() => {
    if (!isMobile) return

    const tab = searchParams?.get('tab')
    const isStripeRedirect = searchParams?.get('success') === 'true' || searchParams?.get('refresh') === 'true'

    if (isStripeRedirect) {
      setOpenMobilePanels({ payments: true })
      setMountedMobilePanels((prev) => ({ ...prev, payments: true }))
      return
    }

    if (tab && ['payments','features','locations','forms','teachers','legal','team','subscription','notifications'].includes(tab)) {
      const key = tab as any
      setOpenMobilePanels({ [key]: true })
      setMountedMobilePanels((prev) => ({ ...prev, [key]: true }))
    }
  }, [isMobile, searchParams])

  useEffect(() => {
    if (!isMobile) return
    if (openMobilePanels.legal && studioId) {
      loadPolicy()
    }
    if (openMobilePanels.notifications && studioId) {
      loadStudioNotifPrefs()
    }
  }, [isMobile, openMobilePanels.legal, openMobilePanels.notifications, studioId])

  useEffect(() => {
    if (isMobile) return
    if (active === 'notifications' && studioId) {
      loadStudioNotifPrefs()
    }
  }, [isMobile, active, studioId])

  return (
    <div className="max-w-7xl mx-auto text-slate-900 dark:text-slate-100">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">Instellingen</h1>
        <p className="text-slate-600 dark:text-slate-300 mt-1">Beheer je studio instellingen</p>
      </div>

      {/* transient operation result toasts shown via NotificationContext */}

      {isMobile ? (
        <div className="space-y-6">
          {loading ? (
            <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700/60 p-8">
              <p className="text-slate-600 dark:text-slate-300">Loading settings...</p>
            </div>
          ) : (
            <div className="space-y-6">
              {mobileAccordionGroups.map((group) => (
                <div key={group.key} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
                  <div className="px-4 py-3 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700/60">
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{group.label}</div>
                  </div>

                  <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
                    {group.items.map((item) => {
                      const isOpen = !!openMobilePanels[item.key]
                      const ItemIcon = item.icon
                      const Chevron = isOpen ? ChevronUp : ChevronDown
                      const isMounted = !!mountedMobilePanels[item.key]
                      return (
                        <div key={item.key}>
                          <button
                            type="button"
                            onClick={() => toggleMobilePanel(item.key)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <ItemIcon size={16} className="text-slate-500 dark:text-slate-300 flex-none" />
                              <span className="text-sm font-medium text-slate-900 dark:text-white truncate">{item.label}</span>
                            </div>
                            <Chevron size={16} className="text-slate-500 dark:text-slate-300 flex-none" />
                          </button>

                          {isOpen && (
                            <div className="px-4 pb-4">
                              {isMounted ? <div className="pt-4">{renderTabContent(item.key)}</div> : null}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="flex gap-6">
          {/* Desktop: vertical categorized settings menu */}
          <aside className="hidden lg:block w-72 flex-none">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
              <div className="p-2">
                {categoryConfig.map((category) => {
                  const isExpanded = expandedCategory === category.key
                  const Chevron = isExpanded ? ChevronUp : ChevronDown
                  return (
                    <div key={category.key} className="mb-2 last:mb-0">
                      <button
                        type="button"
                        onClick={() => setExpandedCategory((cur) => (cur === category.key ? null : category.key))}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors"
                      >
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">{category.label}</span>
                        <Chevron size={16} className="text-slate-500 dark:text-slate-300" />
                      </button>

                      {isExpanded && (
                        <div className="mt-1 pl-1">
                          {category.items
                            .filter((item) => item.visible !== false)
                            .map((item) => {
                              const ItemIcon = item.icon
                              const isActive = active === item.key
                              return (
                                <button
                                  key={item.key}
                                  type="button"
                                  onClick={() => onNavigateTab(item.key)}
                                  className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                                    isActive
                                      ? 'bg-blue-50 text-blue-900 border border-blue-200'
                                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                                  }`}
                                >
                                  <ItemIcon size={16} className={isActive ? 'text-blue-700' : 'text-slate-500 dark:text-slate-300'} />
                                  {item.label}
                                </button>
                              )
                            })}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </aside>

          {/* Content */}
          <div className="min-w-0 flex-1">
            {loading ? (
              <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700/60 p-8">
                <p className="text-slate-600 dark:text-slate-300">Loading settings...</p>
              </div>
            ) : active === 'legal' ? (
              renderTabContent('legal')
            ) : active === 'notifications' ? (
              renderTabContent('notifications')
            ) : active === 'schoolyears' ? (
              <div className="space-y-6">
                <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-700/60 p-6">
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Schooljaren</h2>
                  <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                    Gekloonde programma’s voor een nieuw schooljaar staan standaard verborgen op je studio public profile.
                  </p>

                  {schoolYearsMissing ? (
                    <div className="mt-4 text-sm text-slate-600 dark:text-slate-300">
                      Schooljaren zijn nog niet beschikbaar in deze omgeving.
                    </div>
                  ) : (
                    <>
                      <div className="mt-5">
                        <div className="flex items-center justify-between gap-4">
                          <div className="text-sm font-medium text-slate-900 dark:text-white">Actief schooljaar</div>
                          <div className="w-64">
                            <Select
                              variant="sm"
                              value={activeYearId || ''}
                              onChange={async (e) => {
                                const v = String((e as any)?.target?.value || '')
                                if (!v) return
                                const res = await setActiveYear(v)
                                if (!(res as any)?.ok) {
                                  showError((res as any)?.message || 'Kon actief schooljaar niet wijzigen.')
                                } else {
                                  showSuccess('Actief schooljaar aangepast.')
                                }
                              }}
                              className="w-full"
                              disabled={schoolYearsLoading}
                            >
                              {schoolYears.map((y) => (
                                <option key={y.id} value={y.id}>{y.label}</option>
                              ))}
                            </Select>
                          </div>
                        </div>
                      </div>

                      <div className="mt-6">
                        <div className="text-sm font-medium text-slate-900 dark:text-white mb-2">Overzicht</div>
                        <div className="border border-slate-200 dark:border-slate-700/60 rounded-lg overflow-hidden">
                          {schoolYears.length === 0 ? (
                            <div className="p-4 text-sm text-slate-600 dark:text-slate-300">Geen schooljaren gevonden.</div>
                          ) : (
                            <div className="divide-y divide-slate-200 dark:divide-slate-700/60">
                              {schoolYears.map((y) => (
                                <div key={y.id} className="p-4 flex items-center justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                                      {y.label}{y.is_active ? ' (actief)' : ''}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                      {y.starts_on} → {y.ends_on}
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {!y.is_active ? (
                                      <button
                                        type="button"
                                        onClick={async () => {
                                          const res = await setActiveYear(y.id)
                                          if (!(res as any)?.ok) {
                                            showError((res as any)?.message || 'Kon actief schooljaar niet wijzigen.')
                                          } else {
                                            showSuccess('Actief schooljaar aangepast.')
                                          }
                                        }}
                                        className="px-3 py-1.5 rounded-md bg-blue-600 hover:bg-blue-700 text-white text-sm"
                                      >
                                        Actief maken
                                      </button>
                                    ) : null}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="mt-8 border-t border-slate-200 dark:border-slate-700/60 pt-6">
                        <h3 className="text-base font-semibold text-slate-900 dark:text-white">Nieuw schooljaar (kloon)</h3>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
                          Je kan een leeg schooljaar aanmaken, of programma’s kopiëren vanuit het geselecteerde schooljaar.
                          Gekopieerde programma’s starten standaard verborgen op je studio public profile.
                        </p>

                        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Label</label>
                            <input
                              value={cloneLabel}
                              onChange={(e) => setCloneLabel(e.target.value)}
                              className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                              placeholder="2025-2026"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Startdatum</label>
                            <input
                              type="date"
                              value={cloneStartsOn}
                              onChange={(e) => setCloneStartsOn(e.target.value)}
                              className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </div>
                          <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1">Einddatum</label>
                            <input
                              type="date"
                              value={cloneEndsOn}
                              onChange={(e) => setCloneEndsOn(e.target.value)}
                              className="w-full px-3 py-2 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                            />
                          </div>
                        </div>

                        <div className="mt-4 space-y-2">
                          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={cloneCopyPrograms}
                              onChange={() => setCloneCopyPrograms((v) => !v)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-medium">Kopieer programma’s vanuit dit schooljaar</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                Kopieert programma’s + details (planning) + locaties + docenten-koppelingen.
                              </span>
                            </span>
                          </label>

                          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={cloneGenerateLessons}
                              onChange={() => setCloneGenerateLessons((v) => !v)}
                              className="mt-0.5"
                              disabled={!cloneCopyPrograms}
                            />
                            <span className={!cloneCopyPrograms ? 'opacity-60' : ''}>
                              <span className="font-medium">Maak automatisch lessen aan voor de gekopieerde programma’s</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                Als dit aan staat, worden lessen opnieuw gegenereerd op basis van de planning van de gekopieerde programma’s.
                              </span>
                            </span>
                          </label>

                          <label className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-200">
                            <input
                              type="checkbox"
                              checked={cloneMakeActive}
                              onChange={() => setCloneMakeActive((v) => !v)}
                              className="mt-0.5"
                            />
                            <span>
                              <span className="font-medium">Maak dit het actieve schooljaar voor de studio</span>
                              <span className="block text-xs text-slate-500 dark:text-slate-400">
                                Dit bepaalt het standaard schooljaar voor iedereen in de studio.
                              </span>
                            </span>
                          </label>
                        </div>

                        <div className="mt-5 flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleCloneSchoolYear}
                            disabled={cloning}
                            className="px-4 py-2 rounded-md bg-blue-600 hover:bg-blue-700 text-white disabled:opacity-60"
                          >
                            {cloning ? 'Bezig…' : 'Nieuw schooljaar aanmaken'}
                          </button>
                          <button
                            type="button"
                            onClick={() => refreshSchoolYears()}
                            className="px-4 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                          >
                            Vernieuwen
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : active === 'locations' ? (
              <div className="space-y-6">
                <LocationsManagement studioId={studioId} />
              </div>
            ) : active === 'features' ? (
              <div className="space-y-6">
                <FeaturesClient studioId={studioId} />
              </div>
            ) : active === 'team' ? (
              <div className="space-y-6">
                <TeamClient studioId={studioId} />
              </div>
            ) : active === 'forms' ? (
              <div className="space-y-6">
                <FormsManagement studioId={studioId} />
              </div>
            ) : active === 'teachers' ? (
              <div className="space-y-6">
                <TeachersClient studioId={studioId} />
              </div>
            ) : active === 'subscription' ? (
              <div className="space-y-6">
                <SubscriptionClient studioId={studioId} />
              </div>
            ) : (
              <div className="space-y-6">
                <PaymentsClient studioId={studioId} />
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
