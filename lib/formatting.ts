// Kleine helper functies voor consistente datum/tijd weergave
export function formatTimeStr(t?: string) {
  if (!t) return "";
  // support both 'HH:MM:SS' and 'HH:MM'
  if (t.includes(":")) return t.split(":").slice(0, 2).join(":");
  return t;
}

export function formatDateTimeISO(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mmMonth = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mmMonth}/${yyyy} ${hh}:${mm}`;
}

export function formatDateOnly(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = String(d.getFullYear());
  return `${dd}/${mm}/${yyyy}`;
}

// Date-only strings from Postgres typically come as 'YYYY-MM-DD'.
// Parsing them with `new Date('YYYY-MM-DD')` can shift the date depending on timezone.
// This helper formats those strings safely as dd/mm/yyyy.
export function formatDateOnlyFromISODate(s?: string | null) {
  if (!s) return "";
  const v = String(s);
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2];
    const dd = m[3];
    return `${dd}/${mm}/${yyyy}`;
  }
  return formatDateOnly(v);
}

export function formatTimeFromDate(s?: string) {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

export function formatEndTime(
  start?: string | null,
  durationMinutes?: number | null,
) {
  if (!start || !durationMinutes || durationMinutes <= 0) return "";
  // support ISO datetime or HH:MM[:SS]
  let timePart = start;
  if (start.includes("T")) {
    const part = start.split("T")[1];
    if (!part) return "";
    timePart = part;
  }
  const comps = timePart.split(":");
  if (comps.length < 2) return "";
  const hh = parseInt(comps[0] || "0", 10) || 0;
  const mm = parseInt(comps[1] || "0", 10) || 0;
  let total = hh * 60 + mm + Number(durationMinutes);
  total = ((total % (24 * 60)) + (24 * 60)) % (24 * 60);
  const endH = Math.floor(total / 60);
  const endM = total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

export function formatCurrency(
  value?: number | null,
  options?: { cents?: boolean },
) {
  if (value === null || value === undefined) return "";
  const cents = options?.cents ?? true;
  let euros: number;
  if (cents) {
    euros = Number(value) / 100;
  } else {
    euros = Number(value);
  }
  if (Number.isNaN(euros)) return "";
  return `€${euros.toFixed(2)}`;
}

export default {
  formatTimeStr,
  formatDateTimeISO,
  formatDateOnly,
  formatDateOnlyFromISODate,
  formatTimeFromDate,
};
