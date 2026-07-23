import { parseCardNumberQuery } from './card-typeahead';

describe('parseCardNumberQuery', () => {
  it('parses a plain number/total query', () => {
    expect(parseCardNumberQuery('112/125')).toEqual({ localId: '112', total: 125 });
  });

  it('strips leading zeros from the numerator', () => {
    expect(parseCardNumberQuery('004/102')).toEqual({ localId: '4', total: 102 });
  });

  it('keeps a lone zero numerator intact', () => {
    expect(parseCardNumberQuery('0/102')).toEqual({ localId: '0', total: 102 });
  });

  it('uppercases gallery-subset prefixes', () => {
    expect(parseCardNumberQuery('tg12/30')).toEqual({ localId: 'TG12', total: 30 });
    expect(parseCardNumberQuery('GG35/70')).toEqual({ localId: 'GG35', total: 70 });
  });

  it('accepts an alpha-prefixed denominator as printed on gallery cards', () => {
    expect(parseCardNumberQuery('TG01/TG30')).toEqual({ localId: 'TG01', total: 30 });
  });

  it('preserves zero padding after an alpha prefix (API is padding-sensitive there)', () => {
    expect(parseCardNumberQuery('tg01/30')).toEqual({ localId: 'TG01', total: 30 });
  });

  it('tolerates surrounding and inner whitespace', () => {
    expect(parseCardNumberQuery('  112 / 125 ')).toEqual({ localId: '112', total: 125 });
  });

  it('accepts secret-rare numerators above the total', () => {
    expect(parseCardNumberQuery('251/236')).toEqual({ localId: '251', total: 236 });
  });

  it('returns null for name queries and partial input', () => {
    expect(parseCardNumberQuery('pikachu')).toBeNull();
    expect(parseCardNumberQuery('112/')).toBeNull();
    expect(parseCardNumberQuery('/125')).toBeNull();
    expect(parseCardNumberQuery('112')).toBeNull();
    expect(parseCardNumberQuery('swsh123')).toBeNull(); // promo — no denominator
    expect(parseCardNumberQuery('112/125 extra')).toBeNull();
    expect(parseCardNumberQuery('')).toBeNull();
  });
});
