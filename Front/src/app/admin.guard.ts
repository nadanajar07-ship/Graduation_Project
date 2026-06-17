import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './services/auth.service';
import { RoleService } from './services/role.service';

/**
 * adminGuard — restricts a route to organization Owner / Admin only.
 *
 * Members (and unauthenticated users) are bounced to the dashboard
 * home. The backend independently enforces the same rule (403), so
 * this guard is purely a UX gate to keep the page out of reach.
 */
export const adminGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const role = inject(RoleService);
  const router = inject(Router);

  if (!auth.isLoggedIn()) {
    router.navigate(['/login']);
    return false;
  }

  // RoleService derives the org membership role from the current user.
  role.loadMyRole();
  if (!role.isAdmin()) {
    router.navigate(['/dashboard/home']);
    return false;
  }

  return true;
};
