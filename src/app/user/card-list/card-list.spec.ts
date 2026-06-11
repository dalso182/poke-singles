import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { CardList } from './card-list';

describe('CardList', () => {
  let component: CardList;
  let fixture: ComponentFixture<CardList>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CardList],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(CardList);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  // Reading the computed directly (no detectChanges) mirrors the "should
  // create" setup: rendering the template would require router providers for
  // the breadcrumb's routerLink and would trigger the data-loading effect.
  it('uses the catalog heading/path by default', () => {
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('Productos');
    expect((component as unknown as { effectiveBasePath(): string }).effectiveBasePath()).toBe(
      '/products',
    );
  });

  it('switches to offers mode when onSaleOnly is set', () => {
    fixture.componentRef.setInput('onSaleOnly', true);
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('Ofertas');
  });

  it('scopes to the ?categoria= facet but keeps navigation on /products', () => {
    fixture.componentRef.setInput('categoria', 'sellado');
    // Categories list isn't loaded in the test, so the title falls back to the slug.
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('sellado');
    // Filter/sort nav stays on /products; the category rides the merged query param.
    expect((component as unknown as { effectiveBasePath(): string }).effectiveBasePath()).toBe(
      '/products',
    );
  });

  it('shows the Categoría facet on /products but hides it in offers mode', () => {
    const c = component as unknown as { showCategoryFilter(): boolean };
    expect(c.showCategoryFilter()).toBe(true);
    // Still shown when a category is selected (so the active facet is visible).
    fixture.componentRef.setInput('categoria', 'singles');
    expect(c.showCategoryFilter()).toBe(true);
    // Hidden only on /ofertas.
    fixture.componentRef.setInput('onSaleOnly', true);
    expect(c.showCategoryFilter()).toBe(false);
  });

  it('shows Rareza on every category once global rarities are loaded', () => {
    const c = component as unknown as {
      showRareza(): boolean;
      allCardTypes: { set(v: unknown[]): void };
    };
    // No card types loaded yet → nothing to show.
    expect(c.showRareza()).toBe(false);
    // A global rarity (category_id null) makes Rareza available everywhere,
    // regardless of the active category.
    c.allCardTypes.set([{ id: 'r1', category_id: null }]);
    expect(c.showRareza()).toBe(true);
    fixture.componentRef.setInput('categoria', 'sellado');
    expect(c.showRareza()).toBe(true);
  });

  it('uses the ?categoria= param as the effective category', () => {
    const c = component as unknown as { effectiveCategorySlug(): string | undefined };
    expect(c.effectiveCategorySlug()).toBeUndefined();
    fixture.componentRef.setInput('categoria', 'graded');
    expect(c.effectiveCategorySlug()).toBe('graded');
  });
});
