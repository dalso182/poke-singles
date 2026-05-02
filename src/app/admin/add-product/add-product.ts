import { Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { Card } from '@tcgdex/sdk';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDividerModule } from '@angular/material/divider';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { CardTypeahead } from '../../shared/card-typeahead/card-typeahead';
import { CategoriesService } from '../../core/catalog/categories.service';
import { ProductsService } from '../../core/catalog/products.service';
import { SetsService } from '../../core/catalog/sets.service';
import {
  CONDITION_OPTIONS,
  LANGUAGE_OPTIONS,
} from '../../core/catalog/catalog.types';
import type { CategoryRow } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-add-product',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    CardTypeahead,
    MatButtonModule,
    MatCardModule,
    MatDividerModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatSnackBarModule,
  ],
  templateUrl: './add-product.html',
  styleUrl: './add-product.scss',
})
export class AddProduct {
  private readonly fb = inject(FormBuilder);
  private readonly products = inject(ProductsService);
  private readonly categories = inject(CategoriesService);
  private readonly sets = inject(SetsService);
  private readonly snack = inject(MatSnackBar);
  private readonly router = inject(Router);

  protected readonly conditions = CONDITION_OPTIONS;
  protected readonly languages = LANGUAGE_OPTIONS;
  protected readonly categoriesList = signal<CategoryRow[]>([]);
  protected readonly selectedCard = signal<Card | null>(null);
  protected readonly manualMode = signal(false);
  protected readonly saving = signal(false);
  protected readonly hasCategories = computed(() => this.categoriesList().length > 0);

  protected readonly form: FormGroup = this.fb.nonNullable.group({
    name: ['', Validators.required],
    pokemon_name: [''],
    rarity: [''],
    card_number: [''],
    image_url: [''],
    slug: ['', [Validators.required, Validators.pattern(/^[a-z0-9-]+$/)]],
    category_id: ['', Validators.required],
    condition: ['NM'],
    language: ['EN', Validators.required],
    price: [0, [Validators.required, Validators.min(0)]],
    quantity: [1, [Validators.required, Validators.min(0)]],
  });

  constructor() {
    this.bootstrap();
  }

  private async bootstrap(): Promise<void> {
    try {
      this.categoriesList.set(await this.categories.list({ activeOnly: true }));
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    }
  }

  protected onCardSelected(card: Card): void {
    this.selectedCard.set(card);
    this.form.patchValue({
      name: card.name,
      pokemon_name: card.name, // user can refine; trigger lowercase+trims server-side
      rarity: card.rarity ?? '',
      card_number: card.localId ?? '',
      image_url: card.image ? `${card.image}/high.webp` : '',
      slug: this.suggestSlug(card),
    });
  }

  protected enableManualMode(): void {
    this.manualMode.set(true);
    this.selectedCard.set(null);
    this.form.reset({
      name: '',
      pokemon_name: '',
      rarity: '',
      card_number: '',
      image_url: '',
      slug: '',
      category_id: '',
      condition: 'NM',
      language: 'EN',
      price: 0,
      quantity: 1,
    });
  }

  private suggestSlug(card: Card): string {
    const parts = [
      card.name,
      card.localId ?? '',
      card.set?.id ?? '',
    ].filter(Boolean);
    return parts
      .join('-')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  protected async onSubmit(): Promise<void> {
    if (this.form.invalid) return;
    this.saving.set(true);
    try {
      const raw = this.form.getRawValue();
      const inUse = await this.products.slugInUse(raw.slug);
      if (inUse) {
        this.form.get('slug')!.setErrors({ duplicate: true });
        this.snack.open('Ese slug ya está en uso. Edítalo y reintenta.', 'OK', { duration: 5000 });
        return;
      }
      let setId: string | null = null;
      const card = this.selectedCard();
      if (card) {
        const setRow = await this.sets.findOrCreateFromTcgdex(card);
        setId = setRow.id;
      }
      const created = await this.products.create({
        name: raw.name,
        pokemon_name: raw.pokemon_name || null,
        slug: raw.slug,
        rarity: raw.rarity || null,
        card_number: raw.card_number || null,
        image_url: raw.image_url || null,
        category_id: raw.category_id,
        set_id: setId,
        condition: raw.condition || null,
        language: raw.language,
        price: Number(raw.price),
        quantity: Number(raw.quantity),
      });
      this.snack.open('Producto creado', 'Editar', { duration: 5000 })
        .onAction()
        .subscribe(() => this.router.navigate(['/admin/products', created.id, 'edit']));
      this.resetForNext();
    } catch (err) {
      this.snack.open(this.errorMessage(err), 'OK', { duration: 5000 });
    } finally {
      this.saving.set(false);
    }
  }

  private resetForNext(): void {
    this.selectedCard.set(null);
    this.form.reset({
      name: '',
      pokemon_name: '',
      rarity: '',
      card_number: '',
      image_url: '',
      slug: '',
      category_id: this.form.get('category_id')!.value, // keep last category
      condition: 'NM',
      language: this.form.get('language')!.value, // keep last language
      price: 0,
      quantity: 1,
    });
    this.manualMode.set(false);
  }

  private errorMessage(err: unknown): string {
    if (err && typeof err === 'object' && 'message' in err) {
      return String((err as { message: unknown }).message);
    }
    return 'Error desconocido';
  }
}
