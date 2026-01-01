"use client";

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { Plus, Edit, Trash2, X, Check } from 'lucide-react';
import ActionIcon from '@/components/ActionIcon';
import Select from '@/components/Select'
import { useTwoStepConfirm } from '@/components/ui/useTwoStepConfirm';
import { useNotification } from '@/contexts/NotificationContext';
import { LoadingState } from '@/components/ui/LoadingState'
type FormDefinition = {
  id: string;
  studio_id: string;
  name?: string;
  fields_json?: any[];
  created_at?: string;
  updated_at?: string;
};

interface FormsManagementProps {
  studioId: string;
}

export default function FormsManagement({ studioId }: FormsManagementProps) {
  const { showError } = useNotification();
  const { isArmed: isDeleteFormArmed, confirmOrArm: confirmOrArmDeleteForm } = useTwoStepConfirm<string>(4500);
  const { isArmed: isDeleteFieldArmed, confirmOrArm: confirmOrArmDeleteField } = useTwoStepConfirm<string>(4500);
  const [forms, setForms] = useState<FormDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingForm, setEditingForm] = useState<FormDefinition | null>(null);
  const [name, setName] = useState('');
  const [fields, setFields] = useState<any[]>([]);

  useEffect(() => {
    loadForms();
  }, [studioId]);

  const loadForms = async () => {
    if (!studioId) {
      setForms([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    const { data, error } = await supabase
      .from('forms')
      .select('*')
      .eq('studio_id', studioId)
      .order('name');

    if (error) {
      console.error('Error loading forms:', error);
      showError('Kon formulieren niet laden: ' + (error.message || JSON.stringify(error)));
      setForms([]);
    } else {
      setForms(data || []);
    }
    setLoading(false);
  };

  const openCreate = () => {
    setEditingForm(null);
    setName('');
    setFields([]);
    setShowModal(true);
  };

  const handleEdit = (f: FormDefinition) => {
    setEditingForm(f);
    setName(f.name || '');
    setFields(Array.isArray(f.fields_json) ? f.fields_json : []);
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('forms').delete().eq('id', id);
    if (error) {
      console.error('Error deleting form:', error);
      showError('Kon formulier niet verwijderen: ' + (error.message || JSON.stringify(error)));
    } else {
      loadForms();
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    // basic validation for fields
    if (!Array.isArray(fields)) {
      showError('Velden zijn ongeldig');
      return;
    }

    const cleaned = fields.map((f) => {
      const copy: any = { ...f };
      if (copy.type === 'select' && typeof copy.options === 'string') {
        // convert comma-separated options to array
        copy.options = copy.options.split(',').map((s: string) => s.trim()).filter(Boolean);
      }
      return copy;
    });

    const payload = {
      studio_id: studioId,
      name: name.trim() || 'Untitled',
      fields_json: cleaned,
      updated_at: new Date().toISOString(),
    } as any;

    try {
      if (editingForm) {
        const { error } = await supabase.from('forms').update(payload).eq('id', editingForm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('forms').insert(payload);
        if (error) throw error;
      }
      setShowModal(false);
      loadForms();
    } catch (err: any) {
      console.error('Error saving form:', err);
      showError('Kon formulier niet opslaan: ' + (err?.message || JSON.stringify(err)));
    }
  };

  if (loading) {
    return <LoadingState label="Formulieren laden…" />;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Formulieren</h2>
          <p className="text-slate-600 mt-1">Beheer formulierdefinities die je aan programma's kunt koppelen</p>
        </div>
        <button onClick={openCreate} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={18} />
          Nieuw Formulier
        </button>
      </div>

      {forms.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <h3 className="text-xl font-semibold text-slate-900 mb-2">Nog geen formulieren</h3>
          <p className="text-slate-600 mb-6">Maak je eerste formulier aan en koppel het aan programma's</p>
          <button onClick={openCreate} className="inline-flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={18} />
            Nieuw Formulier
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200">
          <div className="divide-y divide-slate-200">
            {forms.map((f) => (
              <div key={f.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-slate-900">{f.name}</h3>
                  <p className="text-sm text-slate-600">{(f.fields_json || []).length} velden</p>
                </div>
                <div className="flex items-center gap-2">
                  <ActionIcon title="Bewerk formulier" onClick={() => handleEdit(f)}>
                    <Edit size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="danger"
                    title={isDeleteFormArmed(f.id) ? 'Klik opnieuw om te verwijderen' : 'Verwijder formulier'}
                    className={isDeleteFormArmed(f.id) ? 'ring-2 ring-red-200' : ''}
                    onClick={() => confirmOrArmDeleteForm(f.id, () => handleDelete(f.id))}
                  >
                    {isDeleteFormArmed(f.id) ? (
                      <>
                        <span className="hidden sm:inline text-sm font-medium">Verwijderen</span>
                        <span className="sm:hidden">
                          <Check size={16} />
                        </span>
                      </>
                    ) : (
                      <Trash2 size={16} />
                    )}
                  </ActionIcon>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {showModal && (
        <div onClick={() => setShowModal(false)} className="fixed inset-0 bg-black/20 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div onClick={(e) => e.stopPropagation()} className="bg-white/90 backdrop-blur-md rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleSave}>
              <div className="flex items-center justify-between p-6 border-b border-slate-200">
                <h2 className="text-xl font-bold text-slate-900">{editingForm ? 'Formulier bewerken' : 'Nieuw formulier'}</h2>
                <button type="button" onClick={() => setShowModal(false)} aria-label="Close" className="text-slate-500 p-2 rounded-md hover:bg-slate-100 transition-colors"><X size={18} /></button>
              </div>
              <div className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Naam *</label>
                  <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2 border border-slate-300 rounded-lg text-slate-900 bg-white" required />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">Velden</label>
                  <p className="text-sm text-slate-500 mb-3">Voeg velden toe die de gebruiker moet invullen. Kies type en (optioneel) opties voor select.</p>

                  <div className="space-y-3">
                    {fields.map((field, idx) => (
                      <div key={field.id || idx} className="p-3 border border-slate-200 rounded-lg bg-white">
                        <div className="flex items-center gap-3">
                          <input
                            type="text"
                            value={field.label || ''}
                            onChange={(e) => {
                              const copy = [...fields];
                              copy[idx] = { ...copy[idx], label: e.target.value };
                              setFields(copy);
                            }}
                            placeholder="Label (bijv. Voornaam)"
                            className="flex-1 px-3 py-2 border border-slate-300 rounded text-slate-900 bg-white"
                          />
                          <Select
                            value={field.type || 'text'}
                            onChange={(e) => {
                              const copy = [...fields];
                              copy[idx] = { ...copy[idx], type: e.target.value };
                              setFields(copy);
                            }}
                            className="w-36"
                          >
                            <option value="text">Text</option>
                            <option value="textarea">Textarea</option>
                            <option value="select">Select</option>
                            <option value="checkbox">Checkbox</option>
                            <option value="date">Date</option>
                          </Select>

                          {/* Styled accessible toggle for 'Vereist' */}
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              role="switch"
                              aria-checked={!!field.required}
                              title={field.required ? 'Aan: verplicht' : 'Uit: optioneel'}
                              onClick={() => {
                                const copy = [...fields];
                                copy[idx] = { ...copy[idx], required: !copy[idx]?.required };
                                setFields(copy);
                              }}
                              className={`relative inline-flex shrink-0 items-center h-6 w-11 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                                field.required ? 'bg-blue-600 focus:ring-blue-300' : 'bg-slate-200 focus:ring-slate-300'
                              }`}
                            >
                              <span
                                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                                  field.required ? 'translate-x-5' : 'translate-x-1'
                                }`}
                              />
                            </button>
                            <div className="text-sm">
                              <div className="font-medium text-slate-900">Vereist</div>
                            </div>
                          </div>

                          <ActionIcon
                            variant="danger"
                            title={isDeleteFieldArmed(`field:${idx}`) ? 'Klik opnieuw om te verwijderen' : 'Verwijder veld'}
                            className={isDeleteFieldArmed(`field:${idx}`) ? 'ring-2 ring-red-200' : ''}
                            onClick={() =>
                              confirmOrArmDeleteField(`field:${idx}`, () => {
                                const copy = fields.filter((_, i) => i !== idx);
                                setFields(copy);
                              })
                            }
                          >
                            {isDeleteFieldArmed(`field:${idx}`) ? <Check size={16} /> : <Trash2 size={16} />}
                          </ActionIcon>
                        </div>

                        {field.type === 'select' && (
                          <div className="mt-3">
                            <input
                              type="text"
                              value={Array.isArray(field.options) ? (field.options || []).join(', ') : (field.options || '')}
                              onChange={(e) => {
                                const copy = [...fields];
                                copy[idx] = { ...copy[idx], options: e.target.value };
                                setFields(copy);
                              }}
                              placeholder="Opties, komma-gescheiden (bijv. rood, blauw, groen)"
                              className="w-full px-3 py-2 border border-slate-300 rounded text-slate-900 bg-white"
                            />
                          </div>
                        )}
                        {/* Preview */}
                        <div className="mt-3">
                          <label className="block text-xs text-slate-500 mb-2">Preview</label>
                          <div className="p-3 bg-slate-50 rounded">
                            {field.type === 'text' && (
                              <input type="text" disabled placeholder={field.label || 'Text input'} className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-900" />
                            )}
                            {field.type === 'textarea' && (
                              <textarea disabled placeholder={field.label || 'Textarea'} className="w-full px-3 py-2 border border-slate-200 rounded bg-white text-slate-900" />
                            )}
                            {field.type === 'select' && (
                              <Select disabled className="border-slate-200">
                                {(Array.isArray(field.options) ? field.options : []).map((opt: string, i: number) => (
                                  <option key={i}>{opt}</option>
                                ))}
                              </Select>
                            )}
                            {field.type === 'checkbox' && (
                              <label className="inline-flex items-center gap-2"><input type="checkbox" disabled /> <span className="text-sm text-slate-900">{field.label || 'Checkbox'}</span></label>
                            )}
                            {field.type === 'date' && (
                              <input type="date" disabled className="px-3 py-2 border border-slate-200 rounded bg-white text-slate-900" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}

                    <div>
                      <button type="button" onClick={() => {
                        const newField = { id: Date.now().toString(), label: '', type: 'text', required: false, options: [] };
                        setFields([...fields, newField]);
                      }} className="inline-flex items-center gap-2 bg-slate-100 text-slate-700 px-3 py-2 rounded">
                        <Plus size={14} /> Voeg veld toe
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              <div className="p-6 border-t border-slate-200">
                <button type="submit" className="w-full flex items-center justify-center bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">Opslaan</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
