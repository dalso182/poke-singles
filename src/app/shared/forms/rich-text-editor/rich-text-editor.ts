import {
  type AfterViewInit,
  Component,
  ElementRef,
  PLATFORM_ID,
  forwardRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NG_VALUE_ACCESSOR, type ControlValueAccessor } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';

export interface EditorColor {
  label: string;
  value: string;
}

/**
 * Minimal WYSIWYG editor for admin-authored modal copy: bold, italic, text
 * color, paragraphs (Enter). Reads/writes an HTML string via
 * ControlValueAccessor so it drops into reactive forms as a control.
 *
 * Built on `contenteditable` + `document.execCommand` — deprecated but
 * universally supported, and exactly right for this four-feature scope; a
 * rich-text library would be overkill. Browser-only (SSR renders an empty
 * shell), guarded via isPlatformBrowser per project convention.
 *
 * Swatches are brand-safe tokens. Brand red (#CE1126) is deliberately absent —
 * it's restricted to the brand bar and the AGOTADA badge (see theme rules).
 */
@Component({
  selector: 'app-rich-text-editor',
  imports: [MatIconModule],
  templateUrl: './rich-text-editor.html',
  styleUrl: './rich-text-editor.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => RichTextEditor),
      multi: true,
    },
  ],
})
export class RichTextEditor implements ControlValueAccessor, AfterViewInit {
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));
  private readonly surface =
    viewChild.required<ElementRef<HTMLDivElement>>('surface');

  protected readonly disabled = signal(false);
  protected readonly colors: EditorColor[] = [
    { label: 'Texto', value: '#15151a' }, // --text-primary
    { label: 'Gris', value: '#5a5a65' }, // --text-secondary
    { label: 'Ámbar', value: '#d4941c' }, // --accent-amber
    { label: 'Verde', value: '#15803d' }, // --success
  ];

  private onChange: (value: string) => void = () => {};
  private onTouched: () => void = () => {};
  /** Value received before the view initialized (writeValue can beat render). */
  private pendingValue = '';

  writeValue(value: string | null): void {
    this.pendingValue = value ?? '';
    const el = this.surfaceEl();
    if (el) el.innerHTML = this.pendingValue;
  }

  registerOnChange(fn: (value: string) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled.set(isDisabled);
  }

  ngAfterViewInit(): void {
    const el = this.surfaceEl();
    if (el) el.innerHTML = this.pendingValue;
  }

  protected onInput(): void {
    const el = this.surfaceEl();
    if (el) this.onChange(el.innerHTML);
  }

  protected onBlur(): void {
    this.onTouched();
  }

  /** mousedown (not click) so the text selection in the surface survives. */
  protected exec(event: MouseEvent, command: 'bold' | 'italic', value?: string): void;
  protected exec(event: MouseEvent, command: 'foreColor', value: string): void;
  protected exec(event: MouseEvent, command: string, value?: string): void {
    event.preventDefault();
    if (!this.isBrowser || this.disabled()) return;
    // Emit <span style="color:..."> instead of legacy <font> tags.
    document.execCommand('styleWithCSS', false, 'true');
    document.execCommand(command, false, value);
    this.onInput();
  }

  private surfaceEl(): HTMLDivElement | null {
    if (!this.isBrowser) return null;
    try {
      return this.surface().nativeElement;
    } catch {
      return null; // view not initialized yet
    }
  }
}
