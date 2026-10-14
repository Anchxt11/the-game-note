/**
 * Platform detection utilities for adapting UX between
 * desktop (Linux/macOS/Windows) and mobile (Android phone/tablet).
 *
 * Used by Canvas, Toolbar, ContextMenu, and layout components
 * to switch between mouse-first and touch-first interaction modes.
 */

/** True if the device supports touch input (phones, tablets, some laptops with touchscreens). */
export const isTouchDevice = (): boolean =>
  'ontouchstart' in window || navigator.maxTouchPoints > 0;

/** True if running inside an Android WebView (Tauri mobile). */
export const isAndroid = (): boolean =>
  /android/i.test(navigator.userAgent);

/** True if running on a phone-sized screen (< 640px width). */
export const isPhoneScreen = (): boolean =>
  window.innerWidth < 640;

/** True if running on a tablet-sized screen (640px – 1024px width). */
export const isTabletScreen = (): boolean =>
  window.innerWidth >= 640 && window.innerWidth <= 1024;

/** True if running on a desktop-sized screen (> 1024px width). */
export const isDesktopScreen = (): boolean =>
  window.innerWidth > 1024;

/**
 * Returns the current device category based on screen width.
 * Useful for conditional rendering and layout decisions.
 */
export type DeviceCategory = 'phone' | 'tablet' | 'desktop';

export const getDeviceCategory = (): DeviceCategory => {
  if (isPhoneScreen()) return 'phone';
  if (isTabletScreen()) return 'tablet';
  return 'desktop';
};

/**
 * Whether the primary input modality is touch (as opposed to mouse).
 * This checks both capability AND screen size — a laptop with a touchscreen
 * still uses mouse-first interactions because it has a large screen.
 *
 * Use this to decide interaction mode (touch gestures vs mouse events).
 */
export const isTouchPrimary = (): boolean =>
  isTouchDevice() && !isDesktopScreen();

/**
 * Minimum touch target size in pixels (Android Material Design guideline).
 * Used for resize handles, connection line endpoints, etc.
 */
export const MIN_TOUCH_TARGET_PX = 44;
