/**
 * Visibility ordering, in one place.
 *
 * `public` < `cv` < `private`: a document or page including level X includes
 * everything below it. The comparison used to be an inline `LEVEL` table in
 * three modules, which is exactly the kind of duplication that eventually
 * disagrees about what "private" means.
 */
import type { Visibility } from './types'

const LEVEL: Record<Visibility, number> = { public: 0, cv: 1, private: 2 }

/** True when `value` may be shown somewhere that allows up to `limit`. */
export function atMost(value: Visibility | undefined, limit: Visibility): boolean {
  return LEVEL[value ?? 'public'] <= LEVEL[limit]
}
