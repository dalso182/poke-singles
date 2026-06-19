import { Component, input } from '@angular/core';
import { ProductCard } from '../product-card/product-card';
import type { ProductCardItem } from '../../core/catalog/catalog.types';

@Component({
  selector: 'app-marquee',
  imports: [ProductCard],
  templateUrl: './marquee.html',
  styleUrl: './marquee.scss',
})
export class Marquee {
  readonly items = input.required<ProductCardItem[]>();
  readonly direction = input<'left' | 'right'>('left');
  readonly durationSeconds = input(56); // slow; ~20% slower than the original 45s
}
