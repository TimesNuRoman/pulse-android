// SPDX-License-Identifier: Apache-2.0
import { describe, it, expect } from 'vitest';
import {
  NOTE_TEMPLATES,
  defaultTemplateVars,
  getAllTemplates,
  getTemplateById,
  hhmm,
  isoDate,
  substituteTemplate,
  type NoteTemplate,
} from '../noteTemplates';

describe('noteTemplates', () => {
  describe('getAllTemplates', () => {
    it('returns at least 4 templates', () => {
      const list = getAllTemplates();
      expect(list.length).toBeGreaterThanOrEqual(4);
    });

    it('returns a fresh array each call (caller can mutate without poisoning the module)', () => {
      const a = getAllTemplates();
      const b = getAllTemplates();
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('every template has the required shape (id, name, description, body, icon)', () => {
      for (const t of getAllTemplates()) {
        expect(typeof t.id).toBe('string');
        expect(t.id.length).toBeGreaterThan(0);
        expect(typeof t.name).toBe('string');
        expect(t.name.length).toBeGreaterThan(0);
        expect(typeof t.description).toBe('string');
        expect(typeof t.body).toBe('string');
        expect(t.body.length).toBeGreaterThan(0);
        expect(['meeting', 'todo', 'journal', 'code', 'reading']).toContain(t.icon);
      }
    });
  });

  describe('getTemplateById', () => {
    it('returns the template for a known id', () => {
      const t = getTemplateById('meeting');
      expect(t).toBeDefined();
      expect(t?.id).toBe('meeting');
      expect(t?.name).toBe('Meeting');
    });

    it('returns undefined for an unknown id', () => {
      expect(getTemplateById('does-not-exist')).toBeUndefined();
      expect(getTemplateById('')).toBeUndefined();
    });

    it('ids in NOTE_TEMPLATES are unique', () => {
      const ids = NOTE_TEMPLATES.map((t) => t.id);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  describe('substituteTemplate', () => {
    const meeting: NoteTemplate = getTemplateById('meeting')!;

    it('substitutes {{date}} and {{time}} when no vars are provided', () => {
      const out = substituteTemplate(meeting);
      const vars = defaultTemplateVars();
      expect(out).toContain(vars.date);
      expect(out).toContain(vars.time);
      expect(out).not.toContain('{{date}}');
      expect(out).not.toContain('{{time}}');
    });

    it('uses caller-supplied vars and overrides defaults', () => {
      const out = substituteTemplate(meeting, {
        date: '2026-01-15',
        time: '09:30',
        attendees: 'Alice, Bob',
      });
      expect(out).toContain('2026-01-15');
      expect(out).toContain('09:30');
      expect(out).toContain('Alice, Bob');
    });

    it('leaves unknown placeholders intact (user can fill them in)', () => {
      const out = substituteTemplate(meeting);
      // {{attendees}} is in the meeting body but is not in defaultTemplateVars
      expect(out).toContain('{{attendees}}');
    });

    it('never inserts the literal token string "$" or any marketing copy', () => {
      // hard rule 10: no `$` in template literals; hard rule 8: no marketing fluff
      for (const t of getAllTemplates()) {
        const out = substituteTemplate(t);
        expect(out).not.toMatch(/\$/);
        expect(out.toLowerCase()).not.toContain('revolutionary');
        expect(out.toLowerCase()).not.toContain('amazing');
        expect(out.toLowerCase()).not.toContain('free, forever');
      }
    });

    it('preserves Cyrillic text untouched in the journal template', () => {
      // hard rule 7 follow-through: UTF-8 sanity, even though we ship English
      const journal: NoteTemplate = getTemplateById('journal')!;
      const cyrillic = 'Сегодня хороший день';
      const out = substituteTemplate(journal, { highlights: cyrillic });
      expect(out).toContain(cyrillic);
    });
  });

  describe('isoDate / hhmm', () => {
    it('isoDate returns YYYY-MM-DD for a known instant', () => {
      // 2026-08-03T15:00 local — pin via local components instead of UTC
      const d = new Date(2026, 7, 3, 15, 0, 0);
      expect(isoDate(d)).toBe('2026-08-03');
    });

    it('hhmm zero-pads hours and minutes', () => {
      const d = new Date(2026, 7, 3, 7, 5, 0);
      expect(hhmm(d)).toBe('07:05');
    });

    it('isoDate matches the regex /^\\d{4}-\\d{2}-\\d{2}$/', () => {
      expect(isoDate()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('defaultTemplateVars', () => {
    it('always exposes date and time', () => {
      const v = defaultTemplateVars();
      expect(v.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.time).toMatch(/^\d{2}:\d{2}$/);
    });
  });
});
