-- 056_create_faqs_table.sql
-- Create faqs table and seed with initial Q&A based on app features and roles

BEGIN;

CREATE TABLE IF NOT EXISTS public.faqs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question text NOT NULL,
  answer text NOT NULL,
  is_active boolean DEFAULT true,
  display_order integer DEFAULT 100,
  created_by uuid NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Seed a few common FAQs (idempotent inserts)
INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'What user roles exist in Flow Manager and what do they do?',
       'Flow Manager has several roles: \n- super_admin: platform-level admin who can manage site settings and legal documents;\n- studio_admin: manages a specific studio (programs, teachers, enrollments);\n- teacher: can manage classes and timesheets for the studios they are linked to;\n- user: regular member who can enroll in programs and manage profiles.',
       true, 1
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'What user roles exist in Flow Manager and what do they do?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'How do I create or manage programs (classes)?',
       'Studio admins create and manage programs from the studio dashboard. Programs include schedule, capacity and pricing. Members can discover and enroll in programs via the public explorer.',
       true, 2
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'How do I create or manage programs (classes)?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'How are payments handled?',
       'Payments are processed via Stripe. Studio owners may connect their Stripe account in the studio settings. Enrollments use Stripe for secure card payments; receipts are stored in the user''s dashboard.',
       true, 3
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'How are payments handled?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'What happens to my profile data when I enroll?',
       'When you enroll, a snapshot of the profile is stored on the enrollment so we keep the historic data used for that registration. You can still edit your profile, but previous enrollments keep the original snapshot.',
       true, 4
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'What happens to my profile data when I enroll?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'How can I invite or manage teachers?',
       'Studio admins can add teachers in the studio dashboard and link them to classes. Teachers see their assigned studios and can manage attendance and timesheets.',
       true, 5
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'How can I invite or manage teachers?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'How do I change site-wide settings like the logo or support email?',
       'Super admins can change site settings (logo, support email, welcome content) from the Super Admin area under Site instellingen. Changes are visible in the public footer and welcome page.',
       true, 6
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'How do I change site-wide settings like the logo or support email?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'Where can I find the Terms of Service and Privacy Policy?',
       'The Terms of Service and Privacy Policy are available as editable legal documents. You can view them using the links in the site footer. Admins can manage versions from the Legal Documents admin area.',
       true, 7
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'Where can I find the Terms of Service and Privacy Policy?');

INSERT INTO public.faqs (question, answer, is_active, display_order)
SELECT 'How do I contact support?',
       'You can contact support using the support email displayed in the footer. Super admins can update it via the Site instellingen page.',
       true, 8
WHERE NOT EXISTS (SELECT 1 FROM public.faqs WHERE question = 'How do I contact support?');

COMMIT;
