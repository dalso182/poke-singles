import { Component, computed, inject, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';
import { debounceTime } from 'rxjs';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import {
  ImageBrowserService,
  type ImageListing,
} from '../../core/images/image-browser.service';

/** Max upload size accepted client-side (the PHP endpoint enforces the same). */
const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;

export type ImagePickerResult = { url: string; path: string; name: string } | null;

interface Crumb {
  readonly label: string;
  readonly path: string;
}

@Component({
  selector: 'app-image-picker-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatTooltipModule,
  ],
  templateUrl: './image-picker-dialog.html',
  styleUrl: './image-picker-dialog.scss',
})
export class ImagePickerDialog {
  private readonly browser = inject(ImageBrowserService);
  private readonly dialogRef = inject<MatDialogRef<ImagePickerDialog, ImagePickerResult>>(MatDialogRef);

  protected readonly listing = signal<ImageListing | null>(null);
  protected readonly loading = signal(false);
  protected readonly uploading = signal(false);
  protected readonly errorMessage = signal<string | null>(null);
  // Whether the inline "new folder" name field is showing.
  protected readonly creatingFolder = signal(false);
  // Path of the just-uploaded file, briefly highlighted in the grid.
  protected readonly recentlyUploaded = signal<string | null>(null);

  protected readonly searchControl = new FormControl('', { nonNullable: true });
  protected readonly folderNameControl = new FormControl('', { nonNullable: true });
  private readonly searchValue = toSignal(
    this.searchControl.valueChanges.pipe(debounceTime(150)),
    { initialValue: '' },
  );

  protected readonly crumbs = computed<Crumb[]>(() => {
    const path = this.listing()?.path ?? '';
    const crumbs: Crumb[] = [{ label: 'Raíz', path: '' }];
    if (!path) return crumbs;
    const parts = path.split('/');
    let acc = '';
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      crumbs.push({ label: part, path: acc });
    }
    return crumbs;
  });

  protected readonly visibleDirs = computed(() => {
    const list = this.listing();
    if (!list) return [];
    const q = this.searchValue().trim().toLowerCase();
    if (!q) return list.dirs;
    return list.dirs.filter((d) => d.name.toLowerCase().includes(q));
  });

  protected readonly visibleFiles = computed(() => {
    const list = this.listing();
    if (!list) return [];
    const q = this.searchValue().trim().toLowerCase();
    if (!q) return list.files;
    return list.files.filter((f) => f.name.toLowerCase().includes(q));
  });

  constructor() {
    this.navigate('');
  }

  protected async navigate(path: string): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set(null);
    this.recentlyUploaded.set(null);
    try {
      const result = await this.browser.list(path);
      this.listing.set(result);
      this.searchControl.setValue('', { emitEvent: false });
    } catch (err) {
      this.errorMessage.set(this.toMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected goUp(): void {
    const parent = this.listing()?.parent;
    if (parent === null || parent === undefined) return;
    this.navigate(parent);
  }

  protected pick(file: { name: string; path: string; url: string }): void {
    this.dialogRef.close({ url: file.url, path: file.path, name: file.name });
  }

  /** Upload a chosen file into the current folder, then show it in the listing. */
  protected async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = ''; // allow re-picking the same file after an error
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.errorMessage.set('Solo se permiten imágenes.');
      return;
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      this.errorMessage.set('La imagen supera el límite de 8 MB.');
      return;
    }

    const folder = this.listing()?.path ?? '';
    this.uploading.set(true);
    this.errorMessage.set(null);
    try {
      const uploaded = await this.browser.upload(folder, file);
      // Refresh so the new file appears, then highlight it — the user clicks it
      // to select (don't auto-close).
      await this.navigate(folder);
      this.recentlyUploaded.set(uploaded.path);
    } catch (err) {
      this.errorMessage.set(this.toMessage(err));
    } finally {
      this.uploading.set(false);
    }
  }

  /** Create a subfolder under the current folder from the inline name field. */
  protected async confirmNewFolder(): Promise<void> {
    const name = this.folderNameControl.value.trim();
    if (!name) return;
    const parent = this.listing()?.path ?? '';
    this.loading.set(true);
    this.errorMessage.set(null);
    try {
      await this.browser.createFolder(parent, name);
      this.folderNameControl.setValue('');
      this.creatingFolder.set(false);
      await this.navigate(parent); // refresh so the new folder shows
    } catch (err) {
      this.errorMessage.set(this.toMessage(err));
    } finally {
      this.loading.set(false);
    }
  }

  protected cancelNewFolder(): void {
    this.folderNameControl.setValue('');
    this.creatingFolder.set(false);
  }

  protected onCancel(): void {
    this.dialogRef.close(null);
  }

  protected formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  }

  private toMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
