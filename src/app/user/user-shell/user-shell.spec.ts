import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';

import { UserShell } from './user-shell';

describe('UserShell', () => {
  let component: UserShell;
  let fixture: ComponentFixture<UserShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [UserShell],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(UserShell);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
