/**
 * Auth Route Group Loading State
 *
 * This loading component is shown during route transitions within the (auth) route group.
 * Uses the unified AuthTransitionOverlay for consistent visual experience.
 */

import { AuthTransitionOverlay } from '@/components/auth/auth-transition-overlay';

export default function AuthLoading() {
  return <AuthTransitionOverlay />;
}









