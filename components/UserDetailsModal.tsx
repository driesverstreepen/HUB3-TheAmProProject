"use client";

import { Mail, Phone, MapPin, Calendar, User } from 'lucide-react';
import Modal from './Modal';

interface UserDetailsModalProps {
  isOpen: boolean;
  onClose: () => void;
  // `user` may be several shapes: a full auth/public user row, an object with `user_metadata`,
  // or already the enrollment `profile_snapshot` object. We accept any and prefer the snapshot.
  user: any;
  enrollments?: Array<{
    program: {
      title: string;
      program_type: string;
    };
    status: string;
    inschrijving_datum: string;
  }>;
}

export default function UserDetailsModal({ isOpen, onClose, user, enrollments = [] }: UserDetailsModalProps) {
  // Prefer an explicit profile snapshot when available. The snapshot uses English field names
  // (first_name, last_name, street, house_number, ...). Some older places use Dutch keys
  // (voornaam, achternaam, telefoon, adres, postcode, stad). Normalize both.
  // The incoming `user` can be one of:
  // - an enrollment `profile_snapshot` object (copied at enrollment time),
  // - an auth/profile row (we sometimes pass the profile row under `user_metadata`),
  // - a small object with `id`/`email` and `user_metadata` attached (members page).
  // - an `inschrijving` object containing `profile_snapshot` and `user`
  // Normalize common Dutch/English keys and also support a full `naam` (single-field name).
  const snapshot = user?.profile_snapshot ?? user?.user_metadata ?? user?.user ?? user ?? {};

  // Name: prefer a full `naam` / `name` if present, otherwise combine first/last.
  const rawFullName = snapshot.naam ?? snapshot.name ?? null;
  const firstName = snapshot.first_name ?? snapshot.voornaam ?? '';
  const lastName = snapshot.last_name ?? snapshot.achternaam ?? '';
  const combinedName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim();
  const displayName = rawFullName ?? (combinedName || snapshot.displayName || user?.naam || user?.name || user?.email || '');

  // Phone: try several common keys used across places
  const phone = (
    snapshot.phone_number ?? snapshot.telefoon ?? snapshot.phone ?? snapshot.mobiel ?? snapshot.mobile ?? snapshot.telefoonnummer ?? user?.telefoon ?? user?.phone ?? ''
  );

  // Address: support Dutch/English variants and some legacy keys
  const street = snapshot.street ?? snapshot.straat ?? snapshot.adres ?? '';
  const houseNumber = snapshot.house_number ?? snapshot.huisnummer ?? snapshot.huisnr ?? '';
  const houseNumberAddition = snapshot.house_number_addition ?? snapshot.huisnummer_toevoeging ?? snapshot.huisnummer_toevoeging ?? '';
  const address = [street, houseNumber ? `${houseNumber}${houseNumberAddition ? ' ' + houseNumberAddition : ''}` : null].filter(Boolean).join(' ');

  const postcode = snapshot.postal_code ?? snapshot.postcode ?? snapshot.zip ?? '';
  const stad = snapshot.city ?? snapshot.stad ?? '';
  const email = snapshot.email ?? snapshot.e_mail ?? user?.email ?? user?.user_email ?? '';
  const dob = snapshot.date_of_birth ?? snapshot.geboortedatum ?? snapshot.dob ?? null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} contentClassName="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto" ariaLabel="Lid details">
      {/* Header */}
      <div className="sticky top-0 bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between">
        <h2 className="t-h2 font-bold text-slate-900">Lid Details</h2>
      </div>

      {/* Content */}
      <div className="p-6 space-y-6">
        {/* Personal Information */}
        <div>
          <h3 className="t-h4 font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <User size={20} className="text-blue-600" />
            Persoonlijke Gegevens
          </h3>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div>
              <div className="t-caption text-slate-600 mb-1">Naam</div>
              {displayName ? (
                <div className="t-body font-medium text-slate-900">{displayName}</div>
              ) : (
                <div className="t-bodySm text-slate-400 italic">Niet ingevuld</div>
              )}
            </div>

            {dob && (
              <div>
                <div className="t-caption text-slate-600 mb-1">Geboortedatum</div>
                <div className="t-body font-medium text-slate-900 flex items-center gap-2">
                  <Calendar size={16} className="text-slate-400" />
                  {new Date(dob).toLocaleDateString('nl-NL')}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Contact Information */}
        <div>
          <h3 className="t-h4 font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <Mail size={20} className="text-blue-600" />
            Contactgegevens
          </h3>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <div>
              <div className="t-caption text-slate-600 mb-1">Email</div>
              <div className="t-body font-medium text-slate-900 flex items-center gap-2">
                <Mail size={16} className="text-slate-400" />
                <a href={`mailto:${email}`} className="text-blue-600 hover:underline">
                  {email}
                </a>
              </div>
            </div>

            {phone ? (
              <div>
                <div className="t-caption text-slate-600 mb-1">Telefoonnummer</div>
                <div className="t-body font-medium text-slate-900 flex items-center gap-2">
                  <Phone size={16} className="text-slate-400" />
                  <a href={`tel:${phone}`} className="text-blue-600 hover:underline">
                    {phone}
                  </a>
                </div>
              </div>
            ) : (
              <div>
                <div className="t-caption text-slate-600 mb-1">Telefoonnummer</div>
                <div className="t-bodySm text-slate-400 italic">Niet ingevuld</div>
              </div>
            )}
          </div>
        </div>

        {/* Address Information */}
        <div>
          <h3 className="t-h4 font-semibold text-slate-900 mb-4 flex items-center gap-2">
            <MapPin size={20} className="text-blue-600" />
            Adresgegevens
          </h3>
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            {address ? (
              <>
                <div>
                  <div className="t-caption text-slate-600 mb-1">Adres</div>
                  <div className="t-body font-medium text-slate-900">{address}</div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="t-caption text-slate-600 mb-1">Postcode</div>
                    <div className="t-body font-medium text-slate-900">{postcode || '-'}</div>
                  </div>
                  <div>
                    <div className="t-caption text-slate-600 mb-1">Stad</div>
                    <div className="t-body font-medium text-slate-900">{stad || '-'}</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="t-bodySm text-slate-400 italic">Geen adresgegevens ingevuld</div>
            )}
          </div>
        </div>

        {/* Enrollments */}
        {enrollments.length > 0 && (
          <div>
            <h3 className="t-h4 font-semibold text-slate-900 mb-4">
              Inschrijvingen ({enrollments.length})
            </h3>
            <div className="space-y-2">
              {enrollments.map((enrollment, index) => (
                <div key={index} className="bg-slate-50 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="t-body font-medium text-slate-900">{enrollment.program.title}</div>
                    <div className="t-bodySm text-slate-600">
                      {enrollment.program.program_type === 'group' ? 'Cursus' : 'Workshop'} • 
                      Ingeschreven: {new Date(enrollment.inschrijving_datum).toLocaleDateString('nl-NL')}
                    </div>
                  </div>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full t-caption font-medium ${
                    enrollment.status === 'actief'
                      ? 'bg-green-100 text-green-800'
                      : 'bg-slate-100 text-slate-800'
                  }`}>
                    {enrollment.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Insurance Notice */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <p className="t-bodySm text-amber-800">
            <strong>Let op:</strong> Deze gegevens zijn verstrekt door het lid en kunnen gebruikt worden voor verzekeringsdoeleinden. 
            Behandel deze informatie vertrouwelijk volgens de AVG-richtlijnen.
          </p>
        </div>
      </div>

    </Modal>
  );
}
 