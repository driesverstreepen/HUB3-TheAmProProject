'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import ContentContainer from '@/components/ContentContainer';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'
import { CheckCircle, Calendar, Award, Building2 } from 'lucide-react';

interface Enrollment {
  id: string;
  status: string;
  inschrijving_datum: string;
  program: {
    title: string;
    program_type: string;
    studio_id: string;
  };
  studio: {
    naam: string;
  };
}

function EnrollmentsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const success = searchParams.get('success');

  const [loading, setLoading] = useState(true);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);

  useEffect(() => {
    loadEnrollments();
  }, []);

  const loadEnrollments = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        router.push('/auth/login?redirect=/enrollments');
        return;
      }

      const { data, error } = await supabase
        .from('inschrijvingen')
        .select(`
          *,
          program:programs!inner(title, program_type, studio_id),
          studio:programs!inner(studio:studio_id(naam))
        `)
        .eq('user_id', user.id)
        .order('inschrijving_datum', { ascending: false });

      if (error) throw error;

      // Flatten the nested studio structure
      const formatted = (data || []).map((enrollment: any) => ({
        ...enrollment,
        studio: enrollment.program?.studio || { naam: 'Onbekend' }
      }));

      setEnrollments(formatted);
    } catch (err) {
      console.error('Failed to load enrollments:', err);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'actief':
        return <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">Actief</span>;
      case 'pending_forms':
        return <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">Formulier open</span>;
      default:
        return <span className="px-2 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-medium">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <LoadingSpinner size={48} className="mb-4" label="Laden" />
            <p className="text-slate-600">Inschrijvingen laden…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <ContentContainer className="py-8">
        {success && (
          <div className="mb-8 p-6 bg-green-50 border border-green-200 rounded-xl flex items-start gap-4">
            <CheckCircle className="w-6 h-6 text-green-600 shrink-0" />
            <div>
              <h3 className="font-semibold text-green-900 mb-1">Inschrijving voltooid!</h3>
              <p className="text-green-800 text-sm">
                Je inschrijvingen zijn succesvol verwerkt. Je ontvangt een bevestigingsmail van de studio(s).
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3 mb-8">
          <Calendar className="w-8 h-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-slate-900">Mijn inschrijvingen</h1>
        </div>

        {enrollments.length === 0 ? (
          <div className="bg-white rounded-2xl p-12 text-center shadow-sm border border-slate-200">
            <Calendar className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-slate-900 mb-2">Nog geen inschrijvingen</h2>
            <p className="text-slate-600 mb-6">Begin met browsen om je eerste programma te vinden</p>
            <button
              onClick={() => router.push('/hub/studios')}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              Programma's ontdekken
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {enrollments.map((enrollment) => (
              <div key={enrollment.id} className="bg-white rounded-xl p-6 shadow-sm border border-slate-200">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-lg font-semibold text-slate-900">
                        {enrollment.program?.title || 'Onbekend programma'}
                      </h3>
                      {getStatusBadge(enrollment.status)}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-slate-600 mb-3">
                      {enrollment.studio && (
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {enrollment.studio.naam}
                        </span>
                      )}
                      {enrollment.program && (
                        <span className="flex items-center gap-1">
                          <Award className="w-4 h-4" />
                          {enrollment.program.program_type}
                        </span>
                      )}
                    </div>

                    <div className="text-sm text-slate-500">
                      Ingeschreven op {new Date(enrollment.inschrijving_datum).toLocaleDateString('nl-NL', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </ContentContainer>
    </div>
  );
}

export default function EnrollmentsPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex items-center gap-2 text-slate-600">
            <LoadingSpinner size={20} label="Laden" indicatorClassName="border-b-slate-600" />
            <span>Laden…</span>
          </div>
        </div>
      }
    >
      <EnrollmentsContent />
    </Suspense>
  );
}
