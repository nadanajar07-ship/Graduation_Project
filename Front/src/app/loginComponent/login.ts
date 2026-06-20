import { Component, OnInit, AfterViewInit, inject, ElementRef, ViewChild, NgZone } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { AuthService } from '../services/auth.service';

declare const google: any;

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './login.html',
  styleUrls: ['./login.css'],
})
export class LoginComponent implements OnInit, AfterViewInit {
  private fb          = inject(FormBuilder);
  private router      = inject(Router);
  private route       = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private zone        = inject(NgZone);

  @ViewChild('googleBtn') googleBtnRef!: ElementRef;

  loginForm!:  FormGroup;
  otpForm!:    FormGroup;

  showPassword  = false;
  isSubmitting  = false;
  errorMessage  = '';

  // 2FA state
  requires2FA   = false;
  pendingEmail  = '';

  private readonly GOOGLE_CLIENT_ID = '24506607384-rums4fal2k0fjc4vcnr99kkmr878d4u3.apps.googleusercontent.com';

  ngOnInit(): void {
    this.loginForm = this.fb.group({
      email:    ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]],
    });

    this.otpForm = this.fb.group({
      code: ['', [Validators.required, Validators.pattern(/^\d{5}$/)]],
    });

    this.loadGoogleSDK();
  }

  ngAfterViewInit(): void {}

  get email()    { return this.loginForm.get('email')!; }
  get password() { return this.loginForm.get('password')!; }
  get code()     { return this.otpForm.get('code')!; }

  togglePassword(): void { this.showPassword = !this.showPassword; }

  // ── Navigate after login ─────────────────────────────────
  // If user has orgId → dashboard
  // If no orgId → onboarding (create/join org)
  private navigateAfterLogin(): void {
    // Honor a `redirect` query param (e.g. from an invitation "Login to
    // Accept" link) so the user lands back where they intended. Only allow
    // internal paths to avoid open-redirect issues.
    const redirect = this.route.snapshot.queryParamMap.get('redirect');
    if (redirect) {
      const path = this.toInternalPath(redirect);
      if (path) {
        this.router.navigateByUrl(path);
        return;
      }
    }

    const user = this.authService.currentUser();
    if (user?.orgId) {
      this.router.navigate(['/dashboard']);
    } else {
      this.router.navigate(['/onboarding']);
    }
  }

  /** Reduce a redirect value to a safe, app-internal path (or null). */
  private toInternalPath(redirect: string): string | null {
    try {
      // Absolute URL → only accept if same origin, keep path+query.
      if (/^https?:\/\//i.test(redirect)) {
        const url = new URL(redirect);
        if (url.origin !== window.location.origin) return null;
        return url.pathname + url.search;
      }
      // Relative path → must start with a single slash (block //evil.com).
      if (redirect.startsWith('/') && !redirect.startsWith('//')) {
        return redirect;
      }
      return null;
    } catch {
      return null;
    }
  }

  // ── Login ────────────────────────────────────────────────
  async onSubmit(): Promise<void> {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';

    const result = await this.authService.login(
      this.email.value,
      this.password.value
    );

    // HttpClient is configured withFetch(), whose response can settle outside
    // Angular's zone — leaving these state changes without change detection
    // (stuck spinner, hidden error banner). Re-enter the zone so the view
    // updates and any navigation runs inside Angular.
    this.zone.run(() => {
      this.isSubmitting = false;

      if (result.success) {
        this.navigateAfterLogin();
      } else if (result.requiresOTP) {
        this.requires2FA  = true;
        this.pendingEmail = this.email.value;
      } else if (result.message?.toLowerCase().includes('not confirmed')) {
        this.router.navigate(['/confirm-email'], {
          queryParams: { email: this.email.value }
        });
      } else {
        this.errorMessage = result.message;
      }
    });
  }

  // ── 2FA OTP Verification ─────────────────────────────────
  async onSubmitOTP(): Promise<void> {
    if (this.otpForm.invalid) {
      this.otpForm.markAllAsTouched();
      return;
    }
    this.isSubmitting = true;
    this.errorMessage = '';

    const result = await this.authService.validateLoginOTP(
      this.pendingEmail,
      this.code.value
    );

    this.zone.run(() => {
      this.isSubmitting = false;

      if (result.success) {
        this.navigateAfterLogin();
      } else {
        this.errorMessage = result.message;
        this.otpForm.reset();
      }
    });
  }

  cancelOTP(): void {
    this.requires2FA  = false;
    this.pendingEmail = '';
    this.errorMessage = '';
    this.otpForm.reset();
  }

  // ── Google OAuth ─────────────────────────────────────────
  private loadGoogleSDK(): void {
    if (typeof google !== 'undefined' && google?.accounts?.id) {
      setTimeout(() => this.renderGoogleButton(), 100);
      return;
    }

    if (document.querySelector('script[src*="accounts.google.com/gsi/client"]')) {
      const check = setInterval(() => {
        if (typeof google !== 'undefined' && google?.accounts?.id) {
          clearInterval(check);
          setTimeout(() => this.renderGoogleButton(), 100);
        }
      }, 100);
      return;
    }

    const script  = document.createElement('script');
    script.src    = 'https://accounts.google.com/gsi/client';
    script.async  = true;
    script.defer  = true;
    script.onload = () => setTimeout(() => this.renderGoogleButton(), 100);
    document.head.appendChild(script);
  }

  private renderGoogleButton(): void {
    if (!this.googleBtnRef?.nativeElement) {
      setTimeout(() => this.renderGoogleButton(), 200);
      return;
    }

    google.accounts.id.initialize({
      client_id: this.GOOGLE_CLIENT_ID,
      callback:  (response: any) => this.handleGoogleResponse(response),
      ux_mode:   'popup',
    });

    this.googleBtnRef.nativeElement.innerHTML = '';

    google.accounts.id.renderButton(this.googleBtnRef.nativeElement, {
      theme:          'outline',
      size:           'large',
      width:          380,
      text:           'continue_with',
      shape:          'rectangular',
      logo_alignment: 'left',
      locale:         'en',
    });
  }

  private async handleGoogleResponse(response: any): Promise<void> {
    const idToken = response?.credential;
    if (!idToken) {
      this.errorMessage = 'Google Sign-In failed. Please try again.';
      return;
    }

    this.isSubmitting = true;
    this.errorMessage = '';

    const result = await this.authService.loginWithGoogle(idToken);

    this.zone.run(() => {
      this.isSubmitting = false;

      if (result.success) {
        this.navigateAfterLogin();
      } else {
        this.errorMessage = result.message;
      }
    });
  }

  loginWithGoogle(): void {}
}