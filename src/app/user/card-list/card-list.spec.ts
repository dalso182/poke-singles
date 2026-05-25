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

  it('scopes to a category and keeps navigation on /categoria/:slug', () => {
    fixture.componentRef.setInput('categorySlug', 'sellado');
    // Categories list isn't loaded in the test, so the title falls back to the slug.
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('sellado');
    expect((component as unknown as { effectiveBasePath(): string }).effectiveBasePath()).toBe(
      '/categoria/sellado',
    );
  });

  it('shows the Categoría facet only on the all-products page', () => {
    const c = component as unknown as { showCategoryFilter(): boolean };
    expect(c.showCategoryFilter()).toBe(true);
    fixture.componentRef.setInput('categorySlug', 'singles');
    expect(c.showCategoryFilter()).toBe(false);
  });

  it('shows Rareza only for singles/graded (route param or facet)', () => {
    const c = component as unknown as { showRareza(): boolean };
    expect(c.showRareza()).toBe(false);
    fixture.componentRef.setInput('categorySlug', 'sellado');
    expect(c.showRareza()).toBe(false);
    fixture.componentRef.setInput('categorySlug', 'singles');
    expect(c.showRareza()).toBe(true);
  });

  it('uses the route category as the effective category', () => {
    const c = component as unknown as {
      effectiveCategorySlug(): string | undefined;
      showRareza(): boolean;
    };
    expect(c.effectiveCategorySlug()).toBeUndefined();
    fixture.componentRef.setInput('categorySlug', 'graded');
    expect(c.effectiveCategorySlug()).toBe('graded');
    expect(c.showRareza()).toBe(true);
  });

  it('labels the card-type filter Rareza for singles and Tipo for sealed', () => {
    const c = component as unknown as { cardTypeFilterLabel(): string };
    fixture.componentRef.setInput('categorySlug', 'singles');
    expect(c.cardTypeFilterLabel()).toBe('Rareza');
    fixture.componentRef.setInput('categorySlug', 'sellado');
    expect(c.cardTypeFilterLabel()).toBe('Tipo');
  });
});
