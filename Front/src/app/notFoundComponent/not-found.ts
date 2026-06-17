import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-not-found',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="nf-wrap">
      <div class="nf-card">
        <div class="nf-code">404</div>
        <div class="nf-divider"></div>
        <div class="nf-body">
          <h1 class="nf-title">Page not found</h1>
          <p class="nf-sub">
            The page you're looking for doesn't exist or has been moved.
          </p>
          <div class="nf-actions">
            <a routerLink="/dashboard" class="nf-btn nf-btn-primary">Go to Dashboard</a>
            <a routerLink="/" class="nf-btn nf-btn-ghost">Back to Home</a>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .nf-wrap {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0b0b14;
      padding: 1.5rem;
    }
    .nf-card {
      display: flex;
      align-items: center;
      gap: 2.5rem;
      background: #13131f;
      border: 1px solid rgba(255,255,255,.07);
      border-radius: 1.25rem;
      padding: 3rem 3.5rem;
      max-width: 560px;
      width: 100%;
      box-shadow: 0 24px 64px rgba(0,0,0,.45);
    }
    .nf-code {
      font-size: 5rem;
      font-weight: 900;
      line-height: 1;
      letter-spacing: -.05em;
      color: #00d4aa;
      flex-shrink: 0;
      font-family: system-ui, sans-serif;
    }
    .nf-divider {
      width: 1px;
      height: 6rem;
      background: rgba(255,255,255,.1);
      flex-shrink: 0;
    }
    .nf-body {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }
    .nf-title {
      margin: 0;
      font-size: 1.35rem;
      font-weight: 700;
      color: #f1f5f9;
      letter-spacing: -.02em;
    }
    .nf-sub {
      margin: 0;
      font-size: .9rem;
      color: #64748b;
      line-height: 1.6;
    }
    .nf-actions {
      display: flex;
      gap: .75rem;
      flex-wrap: wrap;
      margin-top: .25rem;
    }
    .nf-btn {
      display: inline-block;
      padding: .55rem 1.25rem;
      border-radius: .5rem;
      font-size: .875rem;
      font-weight: 600;
      text-decoration: none;
      transition: opacity .15s, background .15s;
    }
    .nf-btn-primary {
      background: #00d4aa;
      color: #08231d;
    }
    .nf-btn-primary:hover { background: #00b894; }
    .nf-btn-ghost {
      background: rgba(255,255,255,.06);
      color: #94a3b8;
      border: 1px solid rgba(255,255,255,.08);
    }
    .nf-btn-ghost:hover { background: rgba(255,255,255,.1); }

    @media (max-width: 480px) {
      .nf-card { flex-direction: column; gap: 1.5rem; padding: 2rem 1.5rem; }
      .nf-divider { width: 6rem; height: 1px; }
      .nf-code { font-size: 4rem; }
    }
  `],
})
export class NotFoundComponent {}
