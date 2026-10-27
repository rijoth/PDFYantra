/**
 * Rotation helpers shared by every renderer (preview, image export, compression).
 *
 * Workspace pages store a rotation delta (0/90/180/270, possibly negative when
 * rotated counter-clockwise). PDF pages also carry an intrinsic `/Rotate` that
 * PDF.js and pdf-lib report separately. Both must be combined before rendering:
 * PDF.js `getViewport({ rotation })` treats the value as absolute and would
 * otherwise discard the intrinsic `/Rotate`.
 */

/**
 * Folds any angle into the 0..359 range. Negative values wrap so that
 * `-90` becomes `270`, matching PDF.js's own viewport normalization.
 */
export const normalizeRotation = (deg: number): number => {
  if (!Number.isFinite(deg)) return 0;
  return ((deg % 360) + 360) % 360;
};

/**
 * Absolute rotation to hand to PDF.js: intrinsic page rotation plus the
 * rotation the user applied in the Organizer.
 */
export const effectiveRotation = (intrinsic: number, workspace: number): number =>
  normalizeRotation((Number.isFinite(intrinsic) ? intrinsic : 0) + (Number.isFinite(workspace) ? workspace : 0));
