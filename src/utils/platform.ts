/**
 * Platform detection utilities for adapting UX between
 * desktop (Linux/macOS/Windows) and mobile (Android phone/tablet).
 *
 * Used by Canvas, Toolbar, ContextMenu, and layout components
 * to switch between mouse-first and touch-first interaction modes.
 */

/** True if the device supports touch input (phones, tablets, touchscreens). */
export const isTouchDevice = (): boolean =>
  typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

/** True if running inside an Android WebView or browser. */
export const isAndroid = (): boolean =>
  typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent);

/**
 * True if running on an Android tablet.
 * Official Android guideline: Android User-Agent WITHOUT the "Mobile" token is a tablet.
 * Also uses physical screen dimensions as a robust fallback for WebViews that include "Mobile".
 */
export const isAndroidTablet = (): boolean => {
  if (!isAndroid()) return false;
  // Official Android rule: "Android" without "Mobile" token is an Android tablet
  if (!/mobile/i.test(navigator.userAgent)) return true;
  // Common tablet model indicators in User-Agent
  if (/tablet|sm-t|sm-x|pixel tablet|tab|tb-|lenovo|kf/i.test(navigator.userAgent)) return true;
  if (typeof window !== 'undefined') {
    if (window.screen) {
      const maxDim = Math.max(window.screen.width, window.screen.height);
      const minDim = Math.min(window.screen.width, window.screen.height);
      if (minDim >= 450 || (maxDim >= 700 && maxDim / Math.max(1, minDim) < 1.95)) return true;
    }
    if (window.innerWidth >= 600 && window.innerHeight >= 450) return true;
    if (window.innerWidth >= 450 && window.innerHeight >= 650) return true;
  }
  return false;
};

/** True if running on an iPad or iOS tablet. */
export const isIPad = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  return (
    /ipad/i.test(navigator.userAgent) ||
    (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
  );
};

/** True if running on a tablet screen or tablet device (Android tablet or iPad). */
export const isTablet = (): boolean => {
  if (isAndroidTablet() || isIPad()) return true;
  if (isTouchDevice() && typeof window !== 'undefined') {
    if (window.screen) {
      const maxDim = Math.max(window.screen.width, window.screen.height);
      const minDim = Math.min(window.screen.width, window.screen.height);
      if (minDim >= 450 || (maxDim >= 700 && maxDim / Math.max(1, minDim) < 1.95)) return true;
    }
    if (window.innerWidth >= 600 && window.innerHeight >= 450) return true;
    if (window.innerWidth >= 450 && window.innerHeight >= 650) return true;
  }
  return false;
};

/**
 * True ONLY if running on an actual mobile phone screen (< 450px and not a tablet/desktop).
 * Phones in portrait are 320-430 CSS pixels wide.
 */
export const isPhoneScreen = (): boolean => {
  if (isTablet() || isAndroidTablet() || isIPad()) return false;
  if (typeof window !== 'undefined') {
    if (!isTouchDevice() && window.innerWidth >= 500) return false;
    if (window.screen) {
      const minDim = Math.min(window.screen.width, window.screen.height);
      if (minDim >= 450) return false;
    }
    return window.innerWidth < 450 || (window.innerHeight < 450 && window.innerWidth < 950);
  }
  return false;
};

/** True if running on a tablet-sized screen (500px – 1024px width). */
export const isTabletScreen = (): boolean => {
  return isTablet();
};

/** True if running on a desktop-sized screen and not a touch mobile/tablet. */
export const isDesktopScreen = (): boolean => {
  if (isTablet() || isAndroidTablet() || isIPad()) return false;
  if (isTouchDevice() && typeof window !== 'undefined' && (window.innerWidth < 600 || window.innerHeight < 450)) return false;
  return true;
};

/**
 * Returns the current device category based on screen width and device detection.
 * Useful for conditional rendering and layout decisions.
 */
export type DeviceCategory = 'phone' | 'tablet' | 'desktop';

export const getDeviceCategory = (): DeviceCategory => {
  if (isTablet() || isAndroidTablet() || isIPad()) return 'tablet';
  if (isPhoneScreen()) return 'phone';
  return 'desktop';
};

/**
 * Whether the primary input modality is touch (as opposed to mouse).
 * This checks both capability AND screen size — a laptop with a touchscreen
 * still uses mouse-first interactions because it has a large screen.
 */
export const isTouchPrimary = (): boolean =>
  isTouchDevice() && getDeviceCategory() !== 'desktop';

/**
 * Minimum touch target size in pixels (Android Material Design guideline).
 * Used for resize handles, connection line endpoints, etc.
 */
export const MIN_TOUCH_TARGET_PX = 44;
