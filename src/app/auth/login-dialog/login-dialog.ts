import { Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { AuthService } from '../../core/auth/auth.service';

type SignInForm = FormGroup<{
  email: FormControl<string>;
  password: FormControl<string>;
}>;

type SignUpForm = FormGroup<{
  email: FormControl<string>;
  password: FormControl<string>;
  displayName: FormControl<string>;
}>;

type MagicLinkForm = FormGroup<{
  email: FormControl<string>;
}>;

@Component({
  selector: 'app-login-dialog',
  imports: [
    ReactiveFormsModule,
    MatButtonModule,
    MatDialogModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatTabsModule,
  ],
  templateUrl: './login-dialog.html',
  styleUrl: './login-dialog.scss',
})
export class LoginDialog {
  private readonly auth = inject(AuthService);
  private readonly dialogRef = inject(MatDialogRef<LoginDialog>);

  protected readonly submitting = signal(false);
  protected readonly errorMessage = signal('');
  protected readonly infoMessage = signal('');

  protected readonly signInForm: SignInForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
  });

  protected readonly magicLinkForm: MagicLinkForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
  });

  protected readonly signUpForm: SignUpForm = new FormGroup({
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(6)],
    }),
    displayName: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(2)],
    }),
  });

  async sendMagicLink(): Promise<void> {
    if (this.magicLinkForm.invalid || this.submitting()) {
      this.magicLinkForm.markAllAsTouched();
      return;
    }
    this.beginSubmit();
    const email = this.magicLinkForm.controls.email.value.trim();
    const { error } = await this.auth.signInWithMagicLink(email);
    this.submitting.set(false);
    if (error) {
      this.showError(error);
      return;
    }
    this.errorMessage.set('');
    this.infoMessage.set(
      `Te enviamos un correo a ${email}. Haz clic en el enlace para iniciar sesión.`,
    );
  }

  async signIn(): Promise<void> {
    if (this.signInForm.invalid || this.submitting()) {
      this.signInForm.markAllAsTouched();
      return;
    }
    this.beginSubmit();
    const { email, password } = this.signInForm.getRawValue();
    const { error } = await this.auth.signInWithPassword(email.trim(), password);
    if (error) {
      this.showError(error);
      return;
    }
    this.dialogRef.close('signed-in');
  }

  async signUp(): Promise<void> {
    if (this.signUpForm.invalid || this.submitting()) {
      this.signUpForm.markAllAsTouched();
      return;
    }
    this.beginSubmit();
    const { email, password, displayName } = this.signUpForm.getRawValue();
    const { error } = await this.auth.signUpWithPassword(
      email.trim(),
      password,
      displayName.trim(),
    );
    if (error) {
      this.showError(error);
      return;
    }
    // If email confirmation is on, the session won't be active until confirmed.
    if (this.auth.isSignedIn()) {
      this.dialogRef.close('signed-up');
      return;
    }
    this.submitting.set(false);
    this.infoMessage.set(
      'Cuenta creada. Si activaste la confirmación por correo, revisa tu bandeja.',
    );
  }

  async signInWithGoogle(): Promise<void> {
    if (this.submitting()) return;
    this.beginSubmit();
    const { error } = await this.auth.signInWithGoogle();
    if (error) {
      this.showError(error);
    }
    // OAuth redirects the browser; the dialog will be torn down on return.
  }

  async forgotPassword(): Promise<void> {
    const email = this.signInForm.controls.email.value.trim();
    if (!email) {
      this.signInForm.controls.email.markAsTouched();
      this.errorMessage.set('Escribe tu correo para enviar el enlace de recuperación.');
      this.infoMessage.set('');
      return;
    }
    this.beginSubmit();
    const { error } = await this.auth.resetPassword(email);
    this.submitting.set(false);
    if (error) {
      this.showError(error);
      return;
    }
    this.errorMessage.set('');
    this.infoMessage.set('Te enviamos un correo para restablecer tu contraseña.');
  }

  protected close(): void {
    this.dialogRef.close();
  }

  private beginSubmit(): void {
    this.submitting.set(true);
    this.errorMessage.set('');
    this.infoMessage.set('');
  }

  private showError(message: string): void {
    this.errorMessage.set(message);
    this.infoMessage.set('');
    this.submitting.set(false);
  }
}
