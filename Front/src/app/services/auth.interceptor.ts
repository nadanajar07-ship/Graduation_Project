import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth   = inject(AuthService);
  const router = inject(Router);
  const token  = auth.token();

  // Skip if no token or request already has Authorization header
  if (!token || req.headers.has('Authorization')) {
    return next(req);
  }

  const cloned = req.clone({
    setHeaders: { Authorization: `Bearer ${token}` }
  });

  // A 401 on an authenticated request means the access token is expired or
  // invalid. There is no client-side refresh token, so clear the session and
  // send the user back to login instead of leaving them on a broken page.
  return next(cloned).pipe(
    catchError((err) => {
      if (err?.status === 401 && auth.isLoggedIn()) {
        auth.logout();
        router.navigate(['/login']);
      }
      return throwError(() => err);
    })
  );
};