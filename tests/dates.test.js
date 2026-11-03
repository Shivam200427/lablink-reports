import {describe,it,expect} from 'vitest';
import {formatIST} from '../client/src/dates.js';
describe('Messages IST display',()=>{
 it('treats database timestamps as UTC and labels IST',()=>expect(formatIST('2026-11-03 10:16:00')).toBe('03 Nov 2026, 03:46 pm IST'));
 it('rolls date forward at India midnight without changing the input',()=>{const s='2026-11-03 19:00:00';expect(formatIST(s)).toBe('04 Nov 2026, 12:30 am IST');expect(s).toBe('2026-11-03 19:00:00')});
 it('preserves an explicit offset and handles invalid dates',()=>{expect(formatIST('2026-11-03T15:46:00+05:30')).toBe('03 Nov 2026, 03:46 pm IST');expect(formatIST('bad')).toBe('-')});
});
