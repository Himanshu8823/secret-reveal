/**
 * Public types of the users module. Narrow on purpose: only what crosses
 * module boundaries.
 */

/**
 * Full user profile shape returned by GET /users/me and PATCH /users/me.
 */
export type UserProfile = {
  id: string;
  // Null for a Google-signup that hasn't completed phone-link onboarding
  // yet (see modules/auth/phone-link.service.ts).
  phone: string | null;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
  bio: string | null;
  createdAt: string;
};

/**
 * Aggregate counts for the profile screen. Posts excludes soft-deleted
 * rows (status filter). Active Groups is the number of group memberships,
 * not the number of distinct posts in those groups — matches the
 * "groups you're in" framing the UI shows.
 */
export type UserStats = {
  posts: number;
  activeGroups: number;
};

/**
 * Service-layer input for updating the caller's profile. Every field is
 * optional; the service uses `undefined` vs `null` to decide which columns
 * to write. Username immutability is enforced at the service layer — once
 * set, an existing username blocks any further change attempt with
 * AppError(400, VALIDATION_FAILED).
 */
export type UpdateProfileInput = {
  userId: string;
  name?: string;
  username?: string;
  bio?: string | null;
  avatarUrl?: string | null;
};

/**
 * Result shape after a successful update. Currently identical to
 * UserProfile (the controller can return either) — kept separate so the
 * service signature stays stable if the PATCH result diverges from the
 * GET shape later (e.g., omitting createdAt).
 */
export type UpdateProfileResult = UserProfile;

/**
 * Member-picker row returned by GET /users. Intentionally narrower than
 * UserProfile: phone / bio / createdAt aren't useful in the picker, and
 * the user was explicit about not surfacing data the picker doesn't need.
 */
export type UserPickerEntry = {
  id: string;
  name: string | null;
  username: string | null;
  avatarUrl: string | null;
};

/**
 * Cursor-paginated result for GET /users. `nextCursor` is the value the
 * client passes back as `?cursor=` to fetch the next page; null means
 * "no more pages".
 */
export type ListUsersResult = {
  users: UserPickerEntry[];
  nextCursor: string | null;
};

/**
 * Service-layer input for the picker list. The caller (req.user.id)
 * is excluded — you can't pick yourself.
 */
export type ListUsersInput = {
  callerId: string;
  cursor?: string;
  limit: number;
  search?: string;
};
