export function nowIso(): string {
  return new Date().toISOString();
}

export function parseIso(value?: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isFutureIso(value?: string | null, now: string = nowIso()): boolean {
  const target = parseIso(value);
  const current = parseIso(now);
  if (target === null || current === null) {
    return false;
  }

  return target > current;
}
