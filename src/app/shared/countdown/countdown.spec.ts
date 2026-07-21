import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Countdown } from './countdown';

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function create(endsAt: string | null): ComponentFixture<Countdown> {
    const fixture = TestBed.createComponent(Countdown);
    fixture.componentRef.setInput('endsAt', endsAt);
    fixture.detectChanges();
    return fixture;
  }

  it('renders days + hh:mm:ss for a multi-day target', () => {
    const fixture = create('2026-07-22T13:00:05Z');
    expect(fixture.nativeElement.textContent.trim()).toBe('2d 01:00:05');
  });

  it('renders hh:mm:ss under a day and flags is-soon under an hour', () => {
    const fixture = create('2026-07-20T12:30:00Z');
    expect(fixture.nativeElement.textContent.trim()).toBe('00:30:00');
    expect(fixture.nativeElement.classList.contains('is-soon')).toBe(true);
    expect(fixture.nativeElement.classList.contains('is-ended')).toBe(false);
  });

  it('ticks down as time advances', () => {
    const fixture = create('2026-07-20T12:30:00Z');
    vi.advanceTimersByTime(10_000);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('00:29:50');
  });

  it('shows Finalizada, sets is-ended, and emits finished when the target passes', () => {
    const fixture = create('2026-07-20T12:00:02Z');
    const finished = vi.fn();
    fixture.componentInstance.finished.subscribe(finished);

    vi.advanceTimersByTime(3000);
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent.trim()).toBe('Finalizada');
    expect(fixture.nativeElement.classList.contains('is-ended')).toBe(true);
    expect(finished).toHaveBeenCalledTimes(1);
  });

  it('reacts when endsAt is pushed out (anti-snipe extension)', () => {
    const fixture = create('2026-07-20T12:00:30Z');
    expect(fixture.nativeElement.textContent.trim()).toBe('00:00:30');

    fixture.componentRef.setInput('endsAt', '2026-07-20T12:05:30Z');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent.trim()).toBe('00:05:30');
  });

  it('shows Por definir when there is no target', () => {
    const fixture = create(null);
    expect(fixture.nativeElement.textContent.trim()).toBe('Por definir');
  });
});
