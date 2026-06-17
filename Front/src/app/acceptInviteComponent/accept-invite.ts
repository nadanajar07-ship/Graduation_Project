import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';

type InviteState =
  | 'loading'
  | 'valid'
  | 'invalid'
  | 'expired'
  | 'accepted'
  | 'alreadyMember';

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="invite-wrapper">
      <div class="invite-card">
        <div class="logo-area">
          <span class="logo-icon">🏢</span>
          <h1>Remote Monitor</h1>
        </div>

        @switch (state()) {
          @case ('loading') {
            <div class="state-box">
              <div class="spinner"></div>
              <p>Validating invitation…</p>
            </div>
          }

          @case ('invalid') {
            <div class="state-box error">
              <span class="icon">⚠️</span>
              <h2>Invitation not valid</h2>
              <p>{{ error() || 'This invitation link is invalid or has already been used.' }}</p>
              <p class="hint">If you think this is a mistake, ask the person who invited you to send a fresh invitation.</p>
              <a routerLink="/login" class="btn">Go to Login</a>
            </div>
          }

          @case ('expired') {
            <div class="state-box warn">
              <span class="icon">⏳</span>
              <h2>Invitation expired</h2>
              <p>This invitation has expired and can no longer be used.</p>
              <p class="hint">Invitations are time-limited for security. Ask an admin to re-invite you.</p>
              <a routerLink="/login" class="btn">Go to Login</a>
            </div>
          }

          @case ('alreadyMember') {
            <div class="state-box success">
              <span class="icon">✓</span>
              <h2>You're already a member</h2>
              <p>You already belong to <strong>{{ orgName() }}</strong>.</p>
              <p class="sub">Taking you to your dashboard…</p>
            </div>
          }

          @case ('accepted') {
            <div class="state-box success">
              <span class="icon">🎉</span>
              <h2>Welcome aboard!</h2>
              <p>You've joined <strong>{{ orgName() }}</strong> as <strong class="cap">{{ role() }}</strong>.</p>
              <p class="sub">Redirecting to your dashboard…</p>
            </div>
          }

          @case ('valid') {
            <div class="invite-info">
              <h2>You're invited!</h2>

              <div class="inviter">
                @if (inviterAvatar()) {
                  <img [src]="inviterAvatar()" alt="" class="inviter-av" />
                } @else {
                  <span class="inviter-av inviter-av-fallback">{{ inviterInitial() }}</span>
                }
                <p><strong>{{ info()?.invitedBy?.username || 'Someone' }}</strong> invited you to join</p>
              </div>

              <div class="org-card">
                @if (orgLogo()) {
                  <img [src]="orgLogo()" alt="" class="org-logo" />
                } @else {
                  <span class="org-icon">🏢</span>
                }
                <div class="org-meta">
                  <strong>{{ info()?.organization?.name }}</strong>
                  <span class="role-badge">{{ info()?.role }}</span>
                </div>
              </div>

              <div class="detail-list">
                @if (info()?.email) {
                  <div class="detail-row">
                    <span class="detail-lbl">Invited email</span>
                    <span class="detail-val">{{ info()?.email }}</span>
                  </div>
                }
                <div class="detail-row">
                  <span class="detail-lbl">Your role</span>
                  <span class="detail-val cap">{{ info()?.role }}</span>
                </div>
                @if (expiryLabel()) {
                  <div class="detail-row">
                    <span class="detail-lbl">Expires</span>
                    <span class="detail-val" [class.soon]="expiresSoon()">{{ expiryLabel() }}</span>
                  </div>
                }
              </div>

              @if (emailMismatch()) {
                <p class="login-note">
                  This invitation is for <strong>{{ info()?.email }}</strong>, but you're signed in as
                  <strong>{{ auth.currentUser()?.email }}</strong>. Sign in with the invited email to accept.
                </p>
                <a routerLink="/login" class="btn btn-ghost">Switch account</a>
              } @else if (!auth.isLoggedIn()) {
                <p class="login-note">You need to be logged in to accept this invitation.</p>
                <a [routerLink]="['/login']" [queryParams]="{ redirect: currentUrl() }" class="btn">
                  Login to Accept
                </a>
              } @else {
                <button class="btn" (click)="accept()" [disabled]="accepting()">
                  {{ accepting() ? 'Accepting…' : 'Accept Invitation' }}
                </button>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .invite-wrapper { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0f172a; padding: 1rem; }
    .invite-card { background: #1e293b; border-radius: 1rem; padding: 2.5rem; width: 100%; max-width: 440px; text-align: center; color: #e2e8f0; box-shadow: 0 20px 50px rgba(0,0,0,.4); }
    .logo-area { margin-bottom: 2rem; }
    .logo-icon { font-size: 2rem; }
    h1 { font-size: 1.25rem; color: #fff; margin: 0.5rem 0 0; }
    .state-box { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; }
    .state-box .icon { font-size: 3rem; line-height: 1; }
    .state-box.success .icon { color: #22c55e; }
    .state-box.error .icon { color: #ef4444; }
    .state-box.warn .icon { color: #f59e0b; }
    .state-box h2 { margin: 0; font-size: 1.25rem; color: #fff; }
    .state-box p { margin: 0; color: #94a3b8; }
    .hint { font-size: 0.8rem; color: #64748b; max-width: 320px; }
    .sub { font-size: 0.875rem; }
    .cap { text-transform: capitalize; }
    .spinner { width: 2rem; height: 2rem; border: 3px solid #334155; border-top-color: #6366f1; border-radius: 50%; animation: spin 0.7s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }
    .invite-info { display: flex; flex-direction: column; gap: 1rem; }
    .invite-info h2 { margin: 0; font-size: 1.5rem; color: #fff; }
    .invite-info p { margin: 0; color: #94a3b8; }
    .inviter { display: flex; align-items: center; justify-content: center; gap: 0.6rem; }
    .inviter-av { width: 2rem; height: 2rem; border-radius: 50%; object-fit: cover; }
    .inviter-av-fallback { display: inline-flex; align-items: center; justify-content: center; background: #312e81; color: #a5b4fc; font-weight: 600; font-size: 0.85rem; }
    .org-card { display: flex; align-items: center; gap: 1rem; background: #0f172a; border-radius: 0.75rem; padding: 1rem; text-align: left; }
    .org-icon { font-size: 2rem; }
    .org-logo { width: 2.5rem; height: 2.5rem; border-radius: 0.5rem; object-fit: cover; }
    .org-meta strong { display: block; color: #fff; }
    .role-badge { display: inline-block; margin-top: 0.25rem; background: #312e81; color: #a5b4fc; padding: 0.15rem 0.6rem; border-radius: 9999px; font-size: 0.75rem; text-transform: capitalize; }
    .detail-list { background: #0f172a; border-radius: 0.75rem; padding: 0.25rem 1rem; }
    .detail-row { display: flex; justify-content: space-between; align-items: center; padding: 0.6rem 0; border-bottom: 1px solid #1e293b; font-size: 0.85rem; }
    .detail-row:last-child { border-bottom: none; }
    .detail-lbl { color: #64748b; }
    .detail-val { color: #e2e8f0; }
    .detail-val.soon { color: #f59e0b; font-weight: 600; }
    .login-note { font-size: 0.875rem; color: #f59e0b; }
    .btn { display: inline-block; padding: 0.75rem 1.5rem; background: #6366f1; color: #fff; border: none; border-radius: 0.5rem; font-size: 1rem; cursor: pointer; text-decoration: none; transition: background 0.2s; }
    .btn:hover { background: #4f46e5; }
    .btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .btn-ghost { background: transparent; border: 1px solid #334155; }
    .btn-ghost:hover { background: #334155; }
  `],
})
export class AcceptInviteComponent implements OnInit {
  private route  = inject(ActivatedRoute);
  private router = inject(Router);
  private http   = inject(HttpClient);
  auth           = inject(AuthService);

  state      = signal<InviteState>('loading');
  accepting  = signal(false);
  error      = signal('');
  info       = signal<any>(null);
  orgName    = signal('');
  role       = signal('');
  token      = signal('');
  currentUrl = signal('');

  // ── Derived invite presentation ──
  orgLogo = computed(() => {
    const l = this.info()?.organization?.logo;
    if (!l) return null;
    return typeof l === 'string' ? l : (l.secure_url ?? l.url ?? null);
  });
  inviterAvatar = computed(() => {
    const img = this.info()?.invitedBy?.image;
    if (!img) return null;
    return typeof img === 'string' ? img : (img.secure_url ?? img.url ?? null);
  });
  inviterInitial = computed(() =>
    this.info()?.invitedBy?.username?.charAt(0)?.toUpperCase() ?? '?'
  );
  emailMismatch = computed(() => {
    const invited = this.info()?.email?.toLowerCase();
    const me = this.auth.currentUser()?.email?.toLowerCase();
    return !!(this.auth.isLoggedIn() && invited && me && invited !== me);
  });
  private msToExpiry = computed(() => {
    const exp = this.info()?.expiresAt;
    return exp ? new Date(exp).getTime() - Date.now() : 0;
  });
  expiresSoon = computed(() => this.msToExpiry() > 0 && this.msToExpiry() < 24 * 3600 * 1000);
  expiryLabel = computed(() => {
    const ms = this.msToExpiry();
    if (!this.info()?.expiresAt) return '';
    if (ms <= 0) return 'Expired';
    const days = Math.floor(ms / (24 * 3600 * 1000));
    if (days >= 1) return `in ${days} day${days > 1 ? 's' : ''}`;
    const hours = Math.floor(ms / (3600 * 1000));
    if (hours >= 1) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    const mins = Math.max(1, Math.floor(ms / 60000));
    return `in ${mins} min`;
  });

  ngOnInit() {
    const t = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.token.set(t);
    this.currentUrl.set(window.location.href);

    if (!t) {
      this.error.set('No invitation token was found in the link.');
      this.state.set('invalid');
      return;
    }
    this.validate(t);
  }

  private async validate(token: string) {
    try {
      const res = await firstValueFrom(
        this.http.get<{ message: string; data: any }>(
          `${BASE}/invite/accept`, { params: { token } }
        )
      );
      this.info.set(res?.data);
      if (res?.data?.status === 'accepted') {
        this.orgName.set(res?.data?.organization?.name || '');
        this.state.set('alreadyMember');
        setTimeout(() => this.router.navigate(['/dashboard']), 2500);
        return;
      }
      this.state.set('valid');
    } catch (err: any) {
      // Map backend status codes to distinct states.
      const status = err?.status;
      const msg = err?.error?.message || '';
      if (status === 410 || /expired/i.test(msg)) {
        this.state.set('expired');
      } else {
        this.error.set(msg || 'This invitation link is invalid or has already been used.');
        this.state.set('invalid');
      }
    }
  }

  async accept() {
    if (!this.auth.isLoggedIn() || this.emailMismatch()) return;
    this.accepting.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ message: string; data: any }>(
          `${BASE}/invite/accept`, { token: this.token() }
        )
      );
      const orgId = res?.data?.organizationId;
      this.orgName.set(res?.data?.organizationName || this.info()?.organization?.name || '');
      this.role.set(res?.data?.role || this.info()?.role || 'member');

      if (orgId) {
        this.auth.setOrgId(orgId);
        this.auth.updateUser({ orgId, role: this.role() });
      }

      // Backend returns alreadyMember:true (HTTP 200) when the user was
      // already in the org — show a distinct "already a member" state.
      this.state.set(res?.data?.alreadyMember ? 'alreadyMember' : 'accepted');
      setTimeout(() => this.router.navigate(['/dashboard']), 2000);
    } catch (err: any) {
      const status = err?.status;
      const msg = err?.error?.message || '';
      if (status === 410 || /expired/i.test(msg)) {
        this.state.set('expired');
      } else if (status === 404) {
        this.error.set(msg);
        this.state.set('invalid');
      } else {
        // Validation/permission errors (e.g. email mismatch) — keep the
        // invite visible and surface the message.
        this.error.set(msg || 'Failed to accept the invitation.');
      }
    } finally {
      this.accepting.set(false);
    }
  }
}
