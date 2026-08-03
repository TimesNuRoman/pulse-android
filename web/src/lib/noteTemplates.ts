// SPDX-License-Identifier: Apache-2.0
/**
 * Note templates (R190).
 *
 * A small set of structured markdown templates the user can pick from when
 * creating a new note. Bodies use `{{placeholder}}` tokens that
 * `substituteTemplate` replaces with default values (`date` = today ISO,
 * `time` = current HH:MM) or caller-supplied overrides.
 *
 * Pure module — no Svelte, no DOM, no Capacitor, no haptics. Tested
 * directly under `lib/__tests__/noteTemplates.test.ts`.
 */
export type TemplateIconKey = 'meeting' | 'todo' | 'journal' | 'code' | 'reading';

export interface NoteTemplate {
  /** Stable id, also used as the data-testid suffix and DOM key. */
  id: string;
  /** Short label shown in the picker row. */
  name: string;
  /** One-line description shown under the name. */
  description: string;
  /** Body with `{{placeholder}}` tokens; substituted at create time. */
  body: string;
  /** Icon key — TemplatePicker maps this to an inline SVG. */
  icon: TemplateIconKey;
}

/** Format a Date as YYYY-MM-DD (ISO date, no time, no timezone offset). */
export function isoDate(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Format a Date as HH:MM in 24h local time. */
export function hhmm(d: Date = new Date()): string {
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/** Build the default substitution table for `substituteTemplate`. */
export function defaultTemplateVars(now: Date = new Date()): Record<string, string> {
  return {
    date: isoDate(now),
    time: hhmm(now),
  };
}

const MEETING_BODY = `# Meeting — {{date}} {{time}}

**Attendees:** {{attendees}}

## Agenda
- 

## Notes
- 

## Action items
- [ ] 
`;

const TODO_BODY = `# TODO — {{date}}

## Today
- [ ] 

## This week
- [ ] 

## Backlog
- [ ] 
`;

const JOURNAL_BODY = `# Journal — {{date}}

## Mood
- 

## What happened today
- 

## What I learned
{{highlights}}

## Tomorrow
- 
`;

const CODE_BODY = `# Code snippet — {{date}}

**Language:** {{language}}

\`\`\`ts
// replace with your snippet
\`\`\`

## Notes
- 

## Source
- 
`;

const READING_BODY = `# Reading notes — {{date}}

**Title:** {{title}}
**Author:** {{author}}

## Key ideas
- 

## Quotes
> 

## My take
- 
`;

export const NOTE_TEMPLATES: ReadonlyArray<NoteTemplate> = [
  {
    id: 'meeting',
    name: 'Meeting',
    description: 'Agenda, notes, and action items',
    body: MEETING_BODY,
    icon: 'meeting',
  },
  {
    id: 'todo',
    name: 'TODO',
    description: 'Daily / weekly / backlog checklist',
    body: TODO_BODY,
    icon: 'todo',
  },
  {
    id: 'journal',
    name: 'Journal',
    description: 'Mood, what happened, what I learned',
    body: JOURNAL_BODY,
    icon: 'journal',
  },
  {
    id: 'code',
    name: 'Code snippet',
    description: 'Snippet with language and notes',
    body: CODE_BODY,
    icon: 'code',
  },
  {
    id: 'reading',
    name: 'Reading notes',
    description: 'Key ideas, quotes, and your take',
    body: READING_BODY,
    icon: 'reading',
  },
];

/** All templates in stable order. */
export function getAllTemplates(): NoteTemplate[] {
  return NOTE_TEMPLATES.slice();
}

/** Look up a template by id, or `undefined` if no match. */
export function getTemplateById(id: string): NoteTemplate | undefined {
  return NOTE_TEMPLATES.find((t) => t.id === id);
}

/**
 * Substitute every `{{key}}` placeholder in `template.body` with
 * `vars[key]`. Unknown placeholders are left untouched so the user can
 * still spot and replace them in the editor.
 *
 * - `vars` defaults to `{ date: today ISO, time: HH:MM }` (see
 *   `defaultTemplateVars`).
 * - Missing keys are left as `{{key}}`.
 * - Caller-supplied keys override the defaults.
 */
export function substituteTemplate(
  template: NoteTemplate,
  vars?: Record<string, string>,
): string {
  const merged: Record<string, string> = { ...defaultTemplateVars(), ...(vars ?? {}) };
  return template.body.replace(/\{\{([a-zA-Z0-9_-]+)\}\}/g, (match, key: string) => {
    const v = merged[key];
    return typeof v === 'string' ? v : match;
  });
}
