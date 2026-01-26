'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useParams } from 'next/navigation';
import { Plus, Edit, Trash2, X, MessageSquare, Users, Check } from 'lucide-react';
import ActionIcon from '@/components/ActionIcon';
import { FeatureGate } from '@/components/FeatureGate';
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner'

interface Note {
  id: string;
  title: string;
  message: string;
  visible_to_teacher_ids: string[];
  created_at: string;
  created_by: string;
  updated_at: string;
}

interface Teacher {
  id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

export default function NotesPage() {
  const params = useParams();
  const studioId = params.id as string;

  const { isArmed: isDeleteArmed, confirmOrArm: confirmOrArmDelete, disarm: disarmDelete } =
    useTwoStepConfirm<string>(4500);

  const [notes, setNotes] = useState<Note[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingNote, setEditingNote] = useState<Note | null>(null);
  const [selectedTeachers, setSelectedTeachers] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [featureEnabled, setFeatureEnabled] = useState(true);

  const [formData, setFormData] = useState({
    title: '',
    message: '',
  });

  useEffect(() => {
    if (studioId) {
      loadData();
    }
  }, [studioId]);

  const loadData = async () => {
    if (!studioId) return;
    setLoading(true);

    try {
      // Feature check
      const { data: studioRow } = await supabase
        .from('studios')
        .select('features')
        .eq('id', studioId)
        .maybeSingle();
      setFeatureEnabled(!!studioRow?.features?.notes);

      // Get studio_teachers links first
      const { data: teacherLinks, error: linksError } = await supabase
        .from('studio_teachers')
        .select('user_id')
        .eq('studio_id', studioId);

      if (linksError) throw linksError;

      const teacherIds = (teacherLinks || []).map(link => link.user_id);

      // Get teacher profiles and notes in parallel
      const [notesRes, teachersRes] = await Promise.all([
        supabase
          .from('studio_notes')
          .select('*')
          .eq('studio_id', studioId)
          .order('created_at', { ascending: false }),
        teacherIds.length > 0
          ? supabase
              .from('user_profiles')
              .select('user_id, first_name, last_name, email')
              .in('user_id', teacherIds)
              .order('last_name', { ascending: true })
          : Promise.resolve({ data: [], error: null })
      ]);

      if (notesRes.error) throw notesRes.error;
      if (teachersRes.error) throw teachersRes.error;

      setNotes(notesRes.data || []);
      // Map user_profiles to match expected teacher format (id -> user_id)
      setTeachers((teachersRes.data || []).map(t => ({ ...t, id: t.user_id })));
    } catch (error) {
      console.error('Error loading data:', error);
    }

    setLoading(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!studioId || selectedTeachers.length === 0) return;

    setSaving(true);

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (editingNote) {
        const { error } = await supabase
          .from('studio_notes')
          .update({
            title: formData.title,
            message: formData.message,
            visible_to_teacher_ids: selectedTeachers,
          })
          .eq('id', editingNote.id);

        if (error) throw error;
      } else {
        const { error } = await supabase.from('studio_notes').insert({
          studio_id: studioId,
          title: formData.title,
          message: formData.message,
          visible_to_teacher_ids: selectedTeachers,
          created_by: user.id,
        });

        if (error) throw error;
      }

      resetForm();
      loadData();
    } catch (error: any) {
      console.error('Error saving note:', error);
      alert('Failed to save note: ' + (error.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (note: Note) => {
    setEditingNote(note);
    setFormData({
      title: note.title,
      message: note.message,
    });
    setSelectedTeachers(note.visible_to_teacher_ids || []);
    setShowModal(true);
  };

  const deleteNoteNow = async (id: string) => {
    try {
      const { error } = await supabase.from('studio_notes').delete().eq('id', id);
      if (error) throw error;
      loadData();
    } catch (error) {
      console.error('Error deleting note:', error);
      alert('Failed to delete note');
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      message: '',
    });
    setSelectedTeachers([]);
    setEditingNote(null);
    setShowModal(false);
  };

  useEffect(() => {
    if (!showModal) disarmDelete();
  }, [showModal, disarmDelete]);

  const toggleTeacher = (teacherId: string) => {
    setSelectedTeachers(prev =>
      prev.includes(teacherId)
        ? prev.filter(id => id !== teacherId)
        : [...prev, teacherId]
    );
  };

  const getTeacherNames = (teacherIds: string[]) => {
    if (!teacherIds || teacherIds.length === 0) return 'Geen docenten geselecteerd';
    
    return teacherIds
      .map(id => {
        const teacher = teachers.find(t => t.id === id);
        return teacher ? `${teacher.first_name} ${teacher.last_name}` : null;
      })
      .filter(Boolean)
      .join(', ');
  };

  return (
    <FeatureGate flagKey="studio.notes" mode="page">
      <div className="max-w-6xl">
      <div className="flex justify-between items-start mb-8">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">Studio Notes</h1>
          <p className="text-slate-600 mt-1">Maak en beheer notities voor je docenten</p>
        </div>
        {featureEnabled && (
          <button
            onClick={() => setShowModal(true)}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={20} />
            Nieuw
          </button>
        )}
      </div>

      {!featureEnabled && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <p className="text-red-800">
            Notities zijn uitgeschakeld voor deze studio. Ga naar Settings → Features om Notities in te schakelen.
          </p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center w-full">
            <LoadingSpinner size={48} className="mb-4" label="Notities laden…" />
            <p className="text-slate-600">Notities laden…</p>
          </div>
        </div>
      ) : notes.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-12 text-center">
          <MessageSquare size={48} className="mx-auto text-slate-300 mb-4" />
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Geen notities</h3>
          <p className="text-slate-600">Maak een notitie om informatie te delen met je docenten.</p>
        </div>
      ) : featureEnabled ? (
        <div className="grid gap-4">
          {notes.map((note) => (
            <div key={note.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-slate-900 mb-2">{note.title}</h3>
                  <p className="text-slate-700 whitespace-pre-wrap mb-4">{note.message}</p>

                  <div className="flex flex-wrap gap-4 text-sm text-slate-500">
                    <div className="flex items-center gap-2">
                      <Users size={16} />
                      <span><strong>Zichtbaar voor:</strong> {getTeacherNames(note.visible_to_teacher_ids)}</span>
                    </div>
                    <div>
                      <strong>Aangemaakt:</strong> {new Date(note.created_at).toLocaleDateString('nl-NL')} om{' '}
                      {new Date(note.created_at).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 ml-4">
                  <ActionIcon title="Bewerken" onClick={() => handleEdit(note)}>
                    <Edit size={18} />
                  </ActionIcon>
                  <ActionIcon
                    title={isDeleteArmed(note.id) ? 'Klik opnieuw om te verwijderen' : 'Verwijderen'}
                    variant="danger"
                    onClick={() => confirmOrArmDelete(note.id, () => deleteNoteNow(note.id))}
                    className={isDeleteArmed(note.id) ? 'ring-2 ring-red-200' : ''}
                  >
                    {isDeleteArmed(note.id) ? (
                      <>
                        <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                        <span className="sm:hidden">
                          <Check size={18} />
                        </span>
                      </>
                    ) : (
                      <Trash2 size={18} />
                    )}
                  </ActionIcon>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {showModal && (
        <div
          onClick={resetForm}
          className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center p-4 z-50"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl shadow-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">
                {editingNote ? 'Note Bewerken' : 'Nieuwe Note'}
              </h2>
              <button onClick={resetForm} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Titel *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                  placeholder="Bijv. Belangrijke update"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Bericht *
                </label>
                <textarea
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900"
                  rows={6}
                  placeholder="Schrijf je bericht hier..."
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Zichtbaar voor Docenten * ({selectedTeachers.length} geselecteerd)
                </label>
                <div className="border border-slate-300 rounded-lg p-3 max-h-60 overflow-y-auto bg-slate-50">
                  {teachers.length === 0 ? (
                    <p className="text-sm text-slate-500 text-center py-4">Geen docenten beschikbaar</p>
                  ) : (
                    <div className="space-y-1">
                      {teachers.map((teacher) => (
                        <label
                          key={teacher.id}
                          className="flex items-center gap-3 py-2 px-3 hover:bg-white rounded-lg cursor-pointer transition-colors"
                        >
                          <input
                            type="checkbox"
                            checked={selectedTeachers.includes(teacher.id)}
                            onChange={() => toggleTeacher(teacher.id)}
                            className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-slate-900 font-medium">
                            {teacher.first_name} {teacher.last_name}
                          </span>
                          {teacher.email && (
                            <span className="text-xs text-slate-500 ml-auto">{teacher.email}</span>
                          )}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
                <p className="text-xs text-slate-500 mt-2">
                  Geselecteerde docenten zullen deze notitie op hun dashboard kunnen zien.
                </p>
              </div>

              <div className="flex gap-3 pt-4 border-t border-slate-200">
                <button
                  type="submit"
                  className="flex-1 bg-blue-600 text-white py-2.5 rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  disabled={selectedTeachers.length === 0 || saving}
                >
                  {saving ? 'Opslaan...' : (editingNote ? 'Opslaan' : 'Note Aanmaken')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </FeatureGate>
  );
}
