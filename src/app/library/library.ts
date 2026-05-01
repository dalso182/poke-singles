import { AfterViewInit, Component, inject, signal, viewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, FormsModule, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';

import { MatAutocompleteModule } from '@angular/material/autocomplete';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatChipsModule } from '@angular/material/chips';
import { provideNativeDateAdapter } from '@angular/material/core';
import { MatDatepickerModule } from '@angular/material/datepicker';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatDividerModule } from '@angular/material/divider';
import { MatExpansionModule } from '@angular/material/expansion';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatListModule } from '@angular/material/list';
import { MatMenuModule } from '@angular/material/menu';
import { MatPaginator, MatPaginatorModule } from '@angular/material/paginator';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatRadioModule } from '@angular/material/radio';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSliderModule } from '@angular/material/slider';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatSort, MatSortModule } from '@angular/material/sort';
import { MatStepperModule } from '@angular/material/stepper';
import { MatTableDataSource, MatTableModule } from '@angular/material/table';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';

import { LibraryDialog } from './library-dialog';

interface InventoryRow {
  id: string;
  name: string;
  set: string;
  condition: string;
  priceCRC: number;
  stock: number;
}

interface Swatch {
  name: string;
  cssVar: string;
  hex: string;
  textOn: 'light' | 'dark';
}

@Component({
  selector: 'app-library',
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RouterLink,
    MatAutocompleteModule,
    MatBadgeModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatChipsModule,
    MatDatepickerModule,
    MatDialogModule,
    MatDividerModule,
    MatExpansionModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatListModule,
    MatMenuModule,
    MatPaginatorModule,
    MatProgressBarModule,
    MatProgressSpinnerModule,
    MatRadioModule,
    MatSelectModule,
    MatSlideToggleModule,
    MatSliderModule,
    MatSnackBarModule,
    MatSortModule,
    MatStepperModule,
    MatTableModule,
    MatTabsModule,
    MatTooltipModule,
  ],
  providers: [provideNativeDateAdapter()],
  templateUrl: './library.html',
  styleUrl: './library.scss',
})
export class Library implements AfterViewInit {
  private readonly snackBar = inject(MatSnackBar);
  private readonly dialog = inject(MatDialog);

  protected readonly toc = [
    { id: 'typography', label: 'Typography' },
    { id: 'palette', label: 'Color palette' },
    { id: 'buttons', label: 'Buttons' },
    { id: 'forms', label: 'Form controls' },
    { id: 'chips', label: 'Chips' },
    { id: 'cards', label: 'Cards' },
    { id: 'lists', label: 'Lists' },
    { id: 'tabs', label: 'Tabs' },
    { id: 'expansion', label: 'Expansion panel' },
    { id: 'stepper', label: 'Stepper' },
    { id: 'menu', label: 'Menu' },
    { id: 'tooltip', label: 'Tooltip' },
    { id: 'progress', label: 'Progress' },
    { id: 'badge', label: 'Badge' },
    { id: 'feedback', label: 'Snackbar & Dialog' },
    { id: 'table', label: 'Table' },
    { id: 'brand', label: 'Brand utilities' },
  ];

  protected readonly materialSwatches: readonly Swatch[] = [
    { name: 'Primary', cssVar: '--mat-sys-primary', hex: '#1E3A8A', textOn: 'dark' },
    { name: 'On Primary', cssVar: '--mat-sys-on-primary', hex: '#FFFFFF', textOn: 'light' },
    { name: 'Primary Container', cssVar: '--mat-sys-primary-container', hex: '#DCE1FF', textOn: 'light' },
    { name: 'Tertiary', cssVar: '--mat-sys-tertiary', hex: '#805600', textOn: 'dark' },
    { name: 'Tertiary Container', cssVar: '--mat-sys-tertiary-container', hex: '#FFDDB0', textOn: 'light' },
    { name: 'Error', cssVar: '--mat-sys-error', hex: '#B91C1C', textOn: 'dark' },
    { name: 'Surface', cssVar: '--mat-sys-surface', hex: '#FBFAF7', textOn: 'light' },
    { name: 'Surface Container', cssVar: '--mat-sys-surface-container', hex: '#F4F2ED', textOn: 'light' },
    { name: 'Surface Container High', cssVar: '--mat-sys-surface-container-high', hex: '#EAE7DF', textOn: 'light' },
    { name: 'Outline', cssVar: '--mat-sys-outline', hex: '#CFCBC0', textOn: 'light' },
    { name: 'Outline Variant', cssVar: '--mat-sys-outline-variant', hex: '#E5E2DA', textOn: 'light' },
    { name: 'On Surface', cssVar: '--mat-sys-on-surface', hex: '#15151A', textOn: 'dark' },
  ];

  protected readonly brandSwatches: readonly Swatch[] = [
    { name: 'Brand Red', cssVar: '--brand-red', hex: '#CE1126', textOn: 'dark' },
    { name: 'Brand Red Dark', cssVar: '--brand-red-dark', hex: '#A50E1F', textOn: 'dark' },
    { name: 'Brand Red Soft', cssVar: '--brand-red-soft', hex: '#FDEEF0', textOn: 'light' },
    { name: 'Accent Amber', cssVar: '--accent-amber', hex: '#D4941C', textOn: 'dark' },
    { name: 'Accent Amber Soft', cssVar: '--accent-amber-soft', hex: '#FEF3D7', textOn: 'light' },
    { name: 'Success', cssVar: '--success', hex: '#15803D', textOn: 'dark' },
    { name: 'Warning', cssVar: '--warning', hex: '#A16207', textOn: 'dark' },
    { name: 'Danger', cssVar: '--danger', hex: '#B91C1C', textOn: 'dark' },
  ];

  protected readonly autocompleteSets: readonly string[] = [
    'Base Set',
    'Jungle',
    'Fossil',
    'Neo Genesis',
    'Neo Discovery',
    'Skyridge',
    'Scarlet & Violet',
    'Chilling Reign',
    'Shining Fates',
    'Crystal Guardians',
  ];
  protected readonly autocompleteFilter = signal('');
  protected get filteredSets(): readonly string[] {
    const q = this.autocompleteFilter().toLowerCase();
    return q ? this.autocompleteSets.filter((s) => s.toLowerCase().includes(q)) : this.autocompleteSets;
  }

  protected readonly chips = signal<string[]>(['Holo', 'Near Mint', '1ra Edición']);
  protected removeChip(chip: string): void {
    this.chips.update((list) => list.filter((c) => c !== chip));
  }

  protected readonly requiredEmail = new FormControl('', [Validators.required, Validators.email]);

  protected readonly tableColumns = ['name', 'set', 'condition', 'price', 'stock'];
  protected readonly tableData = new MatTableDataSource<InventoryRow>([
    { id: 'r1', name: 'Charizard ex', set: 'Scarlet & Violet', condition: 'NM', priceCRC: 45000, stock: 1 },
    { id: 'r2', name: 'Greninja & Zoroark GX', set: 'Chilling Reign', condition: 'MP', priceCRC: 97500, stock: 2 },
    { id: 'r3', name: 'Blastoise VMAX', set: 'Shining Fates', condition: 'LP', priceCRC: 28500, stock: 0 },
    { id: 'r4', name: 'Pikachu Illustrator', set: 'Promo', condition: 'NM', priceCRC: 9500000, stock: 1 },
    { id: 'r5', name: 'Venusaur', set: 'Base Set', condition: 'LP', priceCRC: 60000, stock: 3 },
    { id: 'r6', name: 'Mewtwo', set: 'Jungle', condition: 'NM', priceCRC: 18000, stock: 5 },
    { id: 'r7', name: 'Lugia', set: 'Neo Genesis', condition: 'MP', priceCRC: 95000, stock: 1 },
    { id: 'r8', name: 'Umbreon', set: 'Neo Discovery', condition: 'NM', priceCRC: 42000, stock: 2 },
    { id: 'r9', name: 'Snorlax Holo', set: 'Skyridge', condition: 'LP', priceCRC: 65000, stock: 1 },
    { id: 'r10', name: 'Espeon', set: 'Neo Discovery', condition: 'NM', priceCRC: 55000, stock: 2 },
    { id: 'r11', name: 'Rayquaza ex', set: 'Deoxys', condition: 'LP', priceCRC: 120000, stock: 1 },
    { id: 'r12', name: 'Gengar ex', set: 'FireRed & LeafGreen', condition: 'MP', priceCRC: 38000, stock: 0 },
  ]);
  protected readonly paginator = viewChild.required(MatPaginator);
  protected readonly sort = viewChild.required(MatSort);

  protected readonly progressValue = signal(60);

  ngAfterViewInit(): void {
    this.tableData.paginator = this.paginator();
    this.tableData.sort = this.sort();
  }

  protected openSnackBar(): void {
    this.snackBar.open('Pedido recibido. Te escribimos cuando esté listo.', 'Cerrar', {
      duration: 4000,
    });
  }

  protected openDialog(): void {
    this.dialog.open(LibraryDialog, {
      width: '440px',
    });
  }

  protected onAutocompleteInput(event: Event): void {
    this.autocompleteFilter.set((event.target as HTMLInputElement).value);
  }
}
