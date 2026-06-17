import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthService, BASE } from '../services/auth.service';
import { RoleService } from '../services/role.service';

@Component({
  selector: 'app-profile',
  standalone: true,
  imports: [CommonModule, RouterModule, ReactiveFormsModule],
  templateUrl: './profile.html',
  styleUrls: ['./profile.css'],
})
export class ProfileComponent implements OnInit {
  private auth = inject(AuthService);
  private role = inject(RoleService);
  private http = inject(HttpClient);
  private fb   = inject(FormBuilder);

  user = this.auth.currentUser;

  editing    = signal(false);
  saving     = signal(false);
  errorMsg   = signal<string | null>(null);
  successMsg = signal<string | null>(null);

  uploadingImage = signal(false);
  imageError     = signal<string | null>(null);

  // Extra profile fields from backend
  phone      = signal('');
  gender     = signal('');
  address    = signal('');

  // Redesign data (all from existing endpoints)
  orgName    = signal<string>('');
  teams      = signal<any[]>([]);
  projects   = signal<any[]>([]);
  stats      = signal<any | null>(null);
  joinedAt   = signal<string>('');

  editForm = this.fb.group({
    fullName: ['', [Validators.required, Validators.minLength(2)]],
    email:    ['', [Validators.required, Validators.email]],
    phone:    [''],
    gender:   [''],
    address:  [''],
  });

  get userInitial() { return this.user()?.fullName?.charAt(0)?.toUpperCase() ?? '?'; }

  /** Resolve the avatar URL from the (Cloudinary) image object, if any. */
  get avatarUrl(): string | null {
    const img = this.user()?.image;
    if (!img) return null;
    return typeof img === 'string' ? img : (img.secure_url ?? img.url ?? null);
  }

  // ══════════════════════════════════════════════════════════
  // UPLOAD PROFILE IMAGE
  // Backend: PATCH /user/profile/image  (multipart, field "attachment")
  // ══════════════════════════════════════════════════════════
  async onImageSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      this.imageError.set('Please choose an image file.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      this.imageError.set('Image must be smaller than 5 MB.');
      return;
    }

    this.uploadingImage.set(true);
    this.imageError.set(null);

    const form = new FormData();
    form.append('attachment', file);

    try {
      const res = await firstValueFrom(
        this.http.patch<{ data: { user: any } }>(`${BASE}/user/profile/image`, form)
      );
      const u = res?.data?.user;
      if (u?.image) {
        this.auth.updateUser({ image: u.image });
        this.successMsg.set('Profile photo updated.');
        setTimeout(() => this.successMsg.set(null), 3000);
      }
    } catch (err: any) {
      this.imageError.set(err?.error?.message || 'Failed to upload image.');
    } finally {
      this.uploadingImage.set(false);
      input.value = '';
    }
  }

  // ── Role label from org membership (not user.role) ────────
  getRoleLabel() {
    const r = this.role.role();
    if (r === 'owner')   return 'Owner';
    if (r === 'admin')   return 'Admin';
    return 'Member';
  }

  ngOnInit() {
    this.loadProfile();
    this.loadActivity();
    this.loadOrg();
    // Load org role if not already loaded
    this.role.loadMyRole();
  }

  // ── Activity summary + teams + projects (GET /user/profile/dashboard
  //    for stats, GET /user/profile for populated teams/projects) ──
  private async loadActivity() {
    try {
      const dashRes = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/user/profile/dashboard`)
      );
      this.stats.set(dashRes?.data?.stats ?? null);
    } catch (err) {
      console.error('[Profile] loadActivity failed:', err);
    }
  }

  // ── Organization name (GET /org/me) ──
  private async loadOrg() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: { organizations: any[] } }>(`${BASE}/org/me`)
      );
      const orgs = res?.data?.organizations ?? [];
      const current = this.user()?.orgId;
      const match = orgs.find((o) => o._id === current) ?? orgs[0];
      this.orgName.set(match?.name ?? '');
    } catch { /* no org yet */ }
  }

  /** Task completion rate for the activity ring (0–100). */
  get completionRate(): number {
    const s = this.stats();
    if (!s || !s.totalAssignedTasks) return 0;
    return Math.round((s.doneTasks / s.totalAssignedTasks) * 100);
  }

  // ══════════════════════════════════════════════════════════
  // LOAD PROFILE
  // Backend: GET /user/profile
  // Returns full user object with teams, projects, tasks
  // ══════════════════════════════════════════════════════════
  private async loadProfile() {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: any }>(`${BASE}/user/profile`)
      );

      const u = res?.data?.user ?? res?.data;
      if (u) {
        // Update local auth state with fresh data
        this.auth.updateUser({
          username: u.username,
          fullName: u.username,
          email:    u.email,
          image:    u.image,
          role:     u.role,
        });

        this.phone.set(u.phone || '');
        this.gender.set(u.gender || '');
        this.address.set(u.address || '');

        // Populated relations for the redesign cards
        this.teams.set(u.teams ?? []);
        this.projects.set(u.managedProjects ?? []);
        if (u.createdAt) this.joinedAt.set(u.createdAt);

        // Sync edit form
        this.editForm.patchValue({
          fullName: u.username ?? '',
          email:    u.email ?? '',
          phone:    u.phone ?? '',
          gender:   u.gender ?? '',
          address:  u.address ?? '',
        });
      }
    } catch (err) {
      console.error('[Profile] loadProfile failed:', err);
    }
  }

  // ══════════════════════════════════════════════════════════
  // SAVE EDIT
  // Backend: PATCH /user/profile
  // Body: { username, phone, gender, address }
  // NOTE: email change is handled separately via security flow
  // ══════════════════════════════════════════════════════════
  async saveEdit() {
    if (this.editForm.invalid) { this.editForm.markAllAsTouched(); return; }

    this.saving.set(true);
    this.errorMsg.set(null);

    const { fullName, phone, gender, address } = this.editForm.value;

    try {
      await firstValueFrom(
        this.http.patch(`${BASE}/user/profile`, {
          username: fullName,
          phone:    phone || undefined,
          gender:   gender || undefined,
          address:  address || undefined,
        })
      );

      // Update local user signal
      this.auth.updateUser({
        fullName: fullName!,
        username: fullName!,
      });

      this.phone.set(phone || '');
      this.gender.set(gender || '');
      this.address.set(address || '');

      this.successMsg.set('Profile updated successfully.');
      this.editing.set(false);
      setTimeout(() => this.successMsg.set(null), 3000);
    } catch (err: any) {
      this.errorMsg.set(err?.error?.message || 'Failed to update profile.');
    } finally {
      this.saving.set(false);
    }
  }
}