import { Injectable } from '@angular/core';
import TCGdex from '@tcgdex/sdk';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TcgdexService {
  readonly client = new TCGdex('en');

  constructor() {
    const endpoint = environment.tcgdex?.endpoint?.trim();
    if (endpoint) {
      this.client.setEndpoint(endpoint);
    }
  }
}
