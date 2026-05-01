import { Component } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';

@Component({
  selector: 'app-library-dialog',
  imports: [MatButtonModule, MatDialogModule],
  template: `
    <h2 mat-dialog-title>Confirmar acción</h2>
    <mat-dialog-content>
      <p>
        Este es un diálogo de ejemplo. Material maneja modal, backdrop, focus trap y
        cierre con Esc — sin código adicional.
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancelar</button>
      <button mat-flat-button [mat-dialog-close]="'confirm'">Confirmar</button>
    </mat-dialog-actions>
  `,
})
export class LibraryDialog {}
