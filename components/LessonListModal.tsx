"use client";

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Program } from '@/types/database';
import Modal from './Modal';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';

interface Props {
  program: Program;
  onClose: () => void;
  onLessonSelect: (lesson: any) => void;
}

export default function LessonListModal({ program, onClose, onLessonSelect }: Props) {
  const [lessons, setLessons] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadLessons();
  }, [program]);

  const loadLessons = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.from('lessons').select('*').eq('program_id', (program as any).id).order('datum', { ascending: true });
      setLessons(data || []);
    } catch (err) {
      console.error('Failed to load lessons', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal isOpen={true} onClose={onClose} contentClassName="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-3xl w-full p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="t-h3 font-semibold">Lessons for {(program as any).title || (program as any).name}</h3>
      </div>

      <div className="space-y-3">
        {loading ? (
          <div className="t-bodySm text-slate-600 flex items-center gap-2">
            <LoadingSpinner size={16} label="Loading" indicatorClassName="border-b-slate-600" />
            <span>Loading lessons…</span>
          </div>
        ) : lessons.length === 0 ? (
          <div className="t-bodySm">No lessons scheduled yet.</div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {lessons.map((l) => (
              <div key={l.id} className="p-3 border border-slate-200 rounded-lg flex items-center justify-between">
                <div>
                  <div className="t-bodySm font-semibold">{l.naam || l.name || 'Lesson'}</div>
                  <div className="t-bodySm">{l.datum} {l.tijd}</div>
                </div>
                <div>
                  <button onClick={() => onLessonSelect(l)} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg t-button t-noColor">Select</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Modal>
  );
}
