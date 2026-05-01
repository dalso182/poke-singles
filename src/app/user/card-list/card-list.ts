import { Component } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

interface MockCard {
  readonly id: string;
  readonly name: string;
  readonly set: string;
  readonly number: string;
  readonly rarity: string;
  readonly priceCRC: number;
  readonly marketPriceCRC: number;
  readonly stock: number;
  readonly featured?: boolean;
  readonly image: string;
}

@Component({
  selector: 'app-card-list',
  imports: [RouterLink, DecimalPipe, MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './card-list.html',
  styleUrl: './card-list.scss',
})
export class CardList {
  protected readonly cards: readonly MockCard[] = [
    { id: 'charizard-base',      name: 'Charizard ex',           set: 'Scarlet & Violet',    number: '199/197', rarity: 'Special Illustration Rare', priceCRC: 45000,   marketPriceCRC: 38000,  stock: 1, featured: true, image: 'assets/images/card1.jpg' },
    { id: 'greninja-zoroark-gx', name: 'Greninja & Zoroark GX',  set: 'Chilling Reign',      number: '201/214', rarity: 'Ultra Rare',                priceCRC: 97500,   marketPriceCRC: 92000,  stock: 2,              image: 'assets/images/card2.jpg' },
    { id: 'blastoise-vmax',      name: 'Blastoise VMAX',          set: 'Shining Fates',       number: '042/072', rarity: 'Rare Holo VMAX',            priceCRC: 28500,   marketPriceCRC: 25000,  stock: 0,              image: 'assets/images/card3.jpg' },
    { id: 'pikachu-illustrator', name: 'Pikachu Illustrator',     set: 'Promo',               number: 'PROMO',   rarity: 'Illustration Rare',         priceCRC: 9500000, marketPriceCRC: 9200000,stock: 1, featured: true, image: 'assets/images/card4.jpg' },
    { id: 'venusaur-base',       name: 'Venusaur',                set: 'Base Set',            number: '015/102', rarity: 'Rare Holo',                 priceCRC: 60000,   marketPriceCRC: 55000,  stock: 3,              image: 'assets/images/card5.jpg' },
    { id: 'mewtwo-jungle',       name: 'Mewtwo',                  set: 'Jungle',              number: '010/064', rarity: 'Rare Holo',                 priceCRC: 18000,   marketPriceCRC: 16500,  stock: 5,              image: 'assets/images/card6.jpg' },
    { id: 'lugia-neo',           name: 'Lugia',                   set: 'Neo Genesis',         number: '009/111', rarity: 'Rare Holo',                 priceCRC: 95000,   marketPriceCRC: 89000,  stock: 1,              image: 'assets/images/card7.jpg' },
    { id: 'umbreon-neo',         name: 'Umbreon',                 set: 'Neo Discovery',       number: '013/075', rarity: 'Rare Holo',                 priceCRC: 42000,   marketPriceCRC: 39000,  stock: 2,              image: 'assets/images/card8.jpg' },
    { id: 'snorlax-skyridge',    name: 'Snorlax Holo',            set: 'Skyridge',            number: 'H29/H32', rarity: 'Rare Holo',                 priceCRC: 65000,   marketPriceCRC: 60000,  stock: 1,              image: 'assets/images/card9.jpg' },
    { id: 'espeon-neo',          name: 'Espeon',                  set: 'Neo Discovery',       number: '001/075', rarity: 'Rare Holo',                 priceCRC: 55000,   marketPriceCRC: 51000,  stock: 2,              image: 'assets/images/card10.jpg' },
    { id: 'rayquaza-ex',         name: 'Rayquaza ex',             set: 'Deoxys',              number: '107/107', rarity: 'Ultra Rare',                priceCRC: 120000,  marketPriceCRC: 110000, stock: 1, featured: true, image: 'assets/images/card11.jpg' },
    { id: 'gengar-ex',           name: 'Gengar ex',               set: 'FireRed & LeafGreen', number: '108/112', rarity: 'Ultra Rare',                priceCRC: 38000,   marketPriceCRC: 35000,  stock: 0,              image: 'assets/images/card12.jpg' },
  ];
}
