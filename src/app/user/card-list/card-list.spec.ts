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
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('Cartas');
    expect((component as unknown as { basePath(): string }).basePath()).toBe('/products');
  });

  it('switches to offers mode when onSaleOnly is set', () => {
    fixture.componentRef.setInput('onSaleOnly', true);
    expect((component as unknown as { pageTitle(): string }).pageTitle()).toBe('Ofertas');
  });
});
