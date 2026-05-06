import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/auth/auth.service';
import { ProfilesService } from '../../core/auth/profiles.service';
import type { ProfileRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-account',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSnackBarModule,
  ],
  templateUrl: './account.html',
  styleUrl: './account.scss',
})
export class Account implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly profiles = inject(ProfilesService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly profile = signal<ProfileRow | null>(null);
  protected readonly loading = signal(false);
  protected readonly saving = signal(false);
  protected readonly email = computed(() => this.auth.currentUser()?.email ?? '');

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    full_name: [''],
    phone: [''],
  });

  ngOnInit(): void {
    void this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    this.loading.set(true);
    try {
      const profile = await this.profiles.getMine();
      this.profile.set(profile);
      if (profile) {
        this.form.patchValue({
          full_name: profile.full_name ?? '',
          phone: profile.phone ?? '',
        });
      }
      this.form.markAsPristine();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.loading.set(false);
    }
  }

  protected async onSave(): Promise<void> {
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const updated = await this.profiles.updateMine({
        full_name: raw.full_name?.trim() || null,
        phone: raw.phone?.trim() || null,
      });
      this.profile.set(updated);
      this.form.markAsPristine();
      this.snack.open('Cuenta actualizada', 'OK', { duration: 3000 });
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  protected async signOut(): Promise<void> {
    const { error } = await this.auth.signOut();
    if (error) {
      this.snack.open(error, 'OK', { duration: 4000 });
      return;
    }
    this.snack.open('Sesión cerrada', 'OK', { duration: 2500 });
    void this.router.navigate(['/']);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
