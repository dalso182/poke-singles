import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { BidConfirmDialog } from './bid-confirm-dialog';

describe('BidConfirmDialog', () => {
  const closeSpy = vi.fn();

  beforeEach(() => {
    closeSpy.mockClear();
    TestBed.configureTestingModule({
      providers: [
        {
          provide: MAT_DIALOG_DATA,
          useValue: { amount: 15000, productName: 'Charizard EX' },
        },
        { provide: MatDialogRef, useValue: { close: closeSpy } },
      ],
    });
  });

  function create(): ComponentFixture<BidConfirmDialog> {
    const fixture = TestBed.createComponent(BidConfirmDialog);
    fixture.detectChanges();
    return fixture;
  }

  function confirmButton(fixture: ComponentFixture<BidConfirmDialog>): HTMLButtonElement {
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    return buttons.find((b) => b.textContent?.includes('Confirmar puja'))!;
  }

  it('shows the amount and product being bid on', () => {
    const fixture = create();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('15,000');
    expect(text).toContain('Charizard EX');
  });

  it('keeps Confirmar disabled until the commitment checkbox is checked', () => {
    const fixture = create();
    expect(confirmButton(fixture).disabled).toBe(true);

    const checkbox = fixture.nativeElement.querySelector(
      'mat-checkbox input',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    expect(confirmButton(fixture).disabled).toBe(false);
  });

  it('closes with true only on confirm', () => {
    const fixture = create();
    const checkbox = fixture.nativeElement.querySelector(
      'mat-checkbox input',
    ) as HTMLInputElement;
    checkbox.click();
    fixture.detectChanges();

    confirmButton(fixture).click();
    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it('closes with false on cancel', () => {
    const fixture = create();
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('button'),
    ) as HTMLButtonElement[];
    buttons.find((b) => b.textContent?.includes('Cancelar'))!.click();
    expect(closeSpy).toHaveBeenCalledWith(false);
  });
});
