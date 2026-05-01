import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-detail',
  imports: [RouterLink, MatCardModule, MatButtonModule, MatIconModule, MatChipsModule],
  templateUrl: './detail.html',
  styleUrl: './detail.scss',
})
export class Detail {
  readonly id = input.required<string>();
}
