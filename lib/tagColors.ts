// Centralized tag color assignment.
// Ensures deterministic, mostly-unique color classes per tag value.

const colorPool = [
  'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-200',
  'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-200',
  'bg-purple-100 text-purple-800 dark:bg-purple-950/40 dark:text-purple-200',
  'bg-pink-100 text-pink-800 dark:bg-pink-950/40 dark:text-pink-200',
  'bg-indigo-100 text-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-200',
  'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-200',
  'bg-yellow-100 text-yellow-800 dark:bg-yellow-950/40 dark:text-yellow-200',
  'bg-teal-100 text-teal-800 dark:bg-teal-950/40 dark:text-teal-200',
  'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-200',
  'bg-cyan-100 text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200',
  'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200',
  'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200'
];

// Keep a module-level mapping so repeated calls return the same class for a tag value
const tagMap = new Map();

function simpleHash(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = s.charCodeAt(i) + ((h << 5) - h);
  return Math.abs(h);
}

export function getTagClass(tagValue: string) {
  if (!tagValue || typeof tagValue !== 'string') return colorPool[0];

  const key = String(tagValue).trim();

  // special-case: always use emerald for proefles / trial related tags
  const lower = key.toLowerCase();
  if (lower.includes('proef') || lower.includes('trial')) {
    const emerald = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200';
    tagMap.set(key, emerald);
    return emerald;
  }

  if (tagMap.has(key)) return tagMap.get(key);

  // prefer first unused color
  const used = new Set(tagMap.values());
  const free = colorPool.find(c => !used.has(c));
  const chosen = free || colorPool[simpleHash(key) % colorPool.length];
  tagMap.set(key, chosen);
  return chosen;
}

export function resetTagMap(): void {
  tagMap.clear();
}
