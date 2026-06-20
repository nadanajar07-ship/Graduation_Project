import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface User {
  _id: string;
  username: string;
  fullName?: string;
  email: string;
  password?: string;
  role: string;
  image?: any;
  orgId?: string;
}

export const BASE        = 'http://localhost:3000';
export const SOCKET_BASE = 'http://localhost:3000';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);

  private _currentUser = signal<User | null>(null);
  private _token = signal<string | null>(null);

  constructor() {
    const token = localStorage.getItem('rms_token');
    const stored = localStorage.getItem('rms_user');
    if (token && stored) {
      this._token.set(token);
      this._currentUser.set(JSON.parse(stored));
    }
  }

  // ✅ FIX: currentUser returns the signal itself
  // استخدامها في الكومبوننت: auth.currentUser()  → User | null
  // استخدامها في الجارد:     auth.currentUser()  → User | null  (مش signal)
  get currentUser(): () => User | null {
    return this._currentUser;
  }

  get token(): () => string | null {
    return this._token;
  }

  isLoggedIn(): boolean {
    return !!this._token();
  }

  // ── LOGIN ────────────────────────────────────────────────
  async login(
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string; requiresOTP?: boolean }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ message: string; data: any }>(
          `${BASE}/auth/login`,
          { email, password }
        ),
      );

      if (res.data?.requiresOTP) {
        return { success: false, message: '2FA_REQUIRED', requiresOTP: true };
      }

      await this.saveSession(res.data.accessToken, res.data.user);
      return { success: true, message: 'Login successful' };
    } catch (err: any) {
      const backendMsg = err?.error?.message ?? '';
      // Wrong email/password → backend returns 401 "Invalid credentials".
      // Surface the required user-facing copy. Other messages (e.g.
      // "Email not confirmed", provider conflicts, or the 429 lockout
      // notice) pass through unchanged so their flows still work.
      if (err?.status === 401 && /invalid credentials/i.test(backendMsg)) {
        return { success: false, message: 'Incorrect email or password' };
      }
      return { success: false, message: backendMsg || 'Incorrect email or password' };
    }
  }

  // ── VALIDATE 2FA OTP ─────────────────────────────────────
  async validateLoginOTP(
    email: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ message: string; data: { accessToken: string; user: User } }>(
          `${BASE}/auth/validate-login-otp`,
          { email, code },
        ),
      );
      await this.saveSession(res.data.accessToken, res.data.user);
      return { success: true, message: 'Login successful' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Invalid OTP' };
    }
  }

  // ── LOGIN WITH GOOGLE ─────────────────────────────────────
  async loginWithGoogle(idToken: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.post<{ message: string; data: { accessToken: string; user: User } }>(
          `${BASE}/auth/loginWithGmail`,
          { idToken },
        ),
      );
      await this.saveSession(res.data.accessToken, res.data.user);
      return { success: true, message: 'Login successful' };
    } catch (loginErr: any) {
      if (loginErr?.status === 404) return this.signupWithGoogle(idToken);
      if (loginErr?.status === 409) {
        return { success: false, message: 'This email is already registered with email/password.' };
      }
      return { success: false, message: loginErr?.error?.message || 'Google Sign-In failed.' };
    }
  }

  async signupWithGoogle(idToken: string): Promise<{ success: boolean; message: string }> {
    try {
      await firstValueFrom(this.http.post(`${BASE}/auth/signupWithGoogle`, { idToken }));
      const loginRes = await firstValueFrom(
        this.http.post<{ message: string; data: { accessToken: string; user: User } }>(
          `${BASE}/auth/loginWithGmail`,
          { idToken },
        ),
      );
      await this.saveSession(loginRes.data.accessToken, loginRes.data.user);
      return { success: true, message: 'Account created!' };
    } catch (err: any) {
      if (err?.status === 409) {
        try {
          const loginRes = await firstValueFrom(
            this.http.post<{ message: string; data: { accessToken: string; user: User } }>(
              `${BASE}/auth/loginWithGmail`,
              { idToken },
            ),
          );
          await this.saveSession(loginRes.data.accessToken, loginRes.data.user);
          return { success: true, message: 'Login successful' };
        } catch (e: any) {
          return { success: false, message: e?.error?.message || 'Login failed.' };
        }
      }
      return { success: false, message: err?.error?.message || 'Google Sign-Up failed.' };
    }
  }

  // ── REGISTER ─────────────────────────────────────────────
  async register(data: {
    fullName: string;
    email: string;
    password: string;
  }): Promise<{ success: boolean; message: string }> {
    try {
      await firstValueFrom(
        this.http.post<{ message: string; data: any }>(`${BASE}/auth/signup`, {
          username: data.fullName,
          email: data.email,
          password: data.password,
          confirmPassword: data.password,
        }),
      );
      return { success: true, message: 'Account created! Please check your email.' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Registration failed.' };
    }
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ message: string }>(`${BASE}/auth/forget-password`, { email }),
      );
      return { success: true, message: res.message || 'OTP sent to your email' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Failed to send reset email' };
    }
  }

  async validateForgotPasswordOTP(
    email: string,
    code: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ message: string }>(`${BASE}/auth/validate-forget-password`, {
          email, code,
        }),
      );
      return { success: true, message: res.message || 'OTP validated' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Invalid OTP' };
    }
  }

  async resetPassword(
    email: string,
    password: string,
  ): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ message: string }>(`${BASE}/auth/reset-password`, {
          email,
          password,
          confirmPassword: password,
        }),
      );
      return { success: true, message: res.message || 'Password reset successful' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Failed to reset password' };
    }
  }

  // ── CONFIRM EMAIL ─────────────────────────────────────────
  async confirmEmail(email: string, code: string): Promise<{ success: boolean; message: string }> {
    try {
      const res = await firstValueFrom(
        this.http.patch<{ message: string }>(`${BASE}/auth/confirm-email`, { email, code }),
      );
      return { success: true, message: res.message || 'Email confirmed' };
    } catch (err: any) {
      return { success: false, message: err?.error?.message || 'Invalid code' };
    }
  }

  // ── SESSION ───────────────────────────────────────────────
  private async saveSession(token: string, user?: User): Promise<void> {
    // If backend didn't return a full user, fetch from /user/profile
    if (!user || !user._id) {
      try {
        const profileRes = await firstValueFrom(
          this.http.get<{ message: string; data: any }>(`${BASE}/user/profile`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        );
        user = (profileRes.data?.user ?? profileRes.data) as User;
      } catch {
        user = { _id: '', username: '', email: '', role: 'Member' };
      }
    }

    const resolvedUser = user as User;
    resolvedUser.fullName = resolvedUser.fullName ?? resolvedUser.username;

    // ✅ FIX: جيب الـ orgId من /org/me بعد اللوجين
    try {
      const orgRes = await firstValueFrom(
        this.http.get<{ message: string; data: { organizations: any[] } }>(
          `${BASE}/org/me`,
          { headers: { Authorization: `Bearer ${token}` } },
        ),
      );
      const firstOrg = orgRes.data?.organizations?.[0];
      if (firstOrg?._id) {
        resolvedUser.orgId = firstOrg._id;
        // The org membership role (owner/admin/member) is the source of
        // truth for admin-gated UI — not the global user.role field.
        if (firstOrg.memberRole) {
          resolvedUser.role = firstOrg.memberRole;
        }
      }
    } catch {
      // no org yet → will redirect to onboarding
    }

    this._token.set(token);
    this._currentUser.set(resolvedUser);
    localStorage.setItem('rms_token', token);
    localStorage.setItem('rms_user', JSON.stringify(resolvedUser));
  }

  logout(): void {
    this._currentUser.set(null);
    this._token.set(null);
    localStorage.removeItem('rms_token');
    localStorage.removeItem('rms_user');
  }

  updateUser(fields: Partial<User>): void {
    const user = this._currentUser();
    if (!user) return;
    const updated = { ...user, ...fields };
    this._currentUser.set(updated);
    localStorage.setItem('rms_user', JSON.stringify(updated));
  }

  setOrgId(orgId: string): void {
    const user = this._currentUser();
    if (!user) return;
    const updated = { ...user, orgId };
    this._currentUser.set(updated);
    localStorage.setItem('rms_user', JSON.stringify(updated));
  }

  clearOrgId(): void {
    const user = this._currentUser();
    if (!user) return;
    const updated = { ...user, orgId: undefined };
    this._currentUser.set(updated);
    localStorage.setItem('rms_user', JSON.stringify(updated));
  }

  async refreshOrgs(): Promise<void> {
    const token = this._token();
    if (!token) return;
    try {
      const orgRes = await firstValueFrom(
        this.http.get<{ message: string; data: { organizations: any[] } }>(`${BASE}/org/me`)
      );
      const orgs: any[] = orgRes.data?.organizations ?? [];
      const user = this._currentUser();
      if (!user) return;

      const currentOrgId = user.orgId;
      const matchedOrg = orgs.find((o: any) => o._id === currentOrgId) ?? orgs[0];

      if (matchedOrg?._id && matchedOrg._id !== currentOrgId) {
        this.setOrgId(matchedOrg._id);
      } else if (!matchedOrg && currentOrgId) {
        this.clearOrgId();
      }

      // Keep the membership role in sync — a server-side promotion/demotion
      // (or the very first org resolution) must be reflected locally so the
      // admin-gated UI stays correct across refreshes. The org membership
      // role is the source of truth, not the global user.role field.
      if (matchedOrg?.memberRole && matchedOrg.memberRole !== user.role) {
        this.updateUser({ role: matchedOrg.memberRole });
      }
    } catch (err: any) {
      if (err?.status === 404) {
        this.clearOrgId();
      }
      /* other network failures — keep current state */
    }
  }

  getMyOrgs() {
    return this.http.get(`${BASE}/org/me`);
  }
}