import { hostedCardImagePath, resolveHostedSrc, tcgdexImageToHostedPath } from './card-image-url';

describe('tcgdexImageToHostedPath', () => {
  it('maps a TCGdex asset URL to our relative hosted path', () => {
    expect(tcgdexImageToHostedPath('https://assets.tcgdex.net/en/swsh/swsh3/136')).toBe(
      '/card-images/swsh/swsh3/136.webp',
    );
  });

  it('handles non-numeric localIds (TG/SV/etc.)', () => {
    expect(tcgdexImageToHostedPath('https://assets.tcgdex.net/en/swsh/swsh11tg/TG01')).toBe(
      '/card-images/swsh/swsh11tg/TG01.webp',
    );
  });

  it('returns empty string when the image is absent', () => {
    expect(tcgdexImageToHostedPath(null)).toBe('');
    expect(tcgdexImageToHostedPath(undefined)).toBe('');
    expect(tcgdexImageToHostedPath('')).toBe('');
  });

  it('returns empty string for a non-TCGdex URL', () => {
    expect(tcgdexImageToHostedPath('https://example.com/foo/bar')).toBe('');
  });
});

describe('hostedCardImagePath', () => {
  it('builds the hosted path from TCGdex identifiers', () => {
    expect(hostedCardImagePath('swsh', 'swsh12.5gg', 'GG04')).toBe(
      '/card-images/swsh/swsh12.5gg/GG04.webp',
    );
  });

  it('matches what tcgdexImageToHostedPath derives from a URL', () => {
    expect(hostedCardImagePath('swsh', 'swsh3', '136')).toBe(
      tcgdexImageToHostedPath('https://assets.tcgdex.net/en/swsh/swsh3/136'),
    );
  });
});

describe('resolveHostedSrc', () => {
  it('makes a relative path absolute against the origin', () => {
    expect(resolveHostedSrc('/card-images/swsh/swsh3/136.webp', 'https://poke-singles.com')).toBe(
      'https://poke-singles.com/card-images/swsh/swsh3/136.webp',
    );
  });

  it('passes absolute URLs through unchanged', () => {
    const abs = 'https://poke-singles.com/card-images/x.webp';
    expect(resolveHostedSrc(abs, 'https://poke-singles.com')).toBe(abs);
  });

  it('falls back to the raw value when no origin is available', () => {
    expect(resolveHostedSrc('/card-images/x.webp', '')).toBe('/card-images/x.webp');
  });

  it('returns empty string for empty input', () => {
    expect(resolveHostedSrc('', 'https://poke-singles.com')).toBe('');
    expect(resolveHostedSrc(null, 'https://poke-singles.com')).toBe('');
  });
});
