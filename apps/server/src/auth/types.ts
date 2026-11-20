export interface AuthenticatedUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthCookieOptions {
  secure: boolean;
}
