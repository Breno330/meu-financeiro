import { useWindowDimensions } from 'react-native';

/**
 * Returns layout breakpoints based on current window width.
 * Mobile  < 640 px
 * Tablet  640 – 1023 px
 * Desktop ≥ 1024 px
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isMobile:  width < 640,
    isTablet:  width >= 640 && width < 1024,
    isDesktop: width >= 1024,
    /** Compact sidebar when narrower than full desktop */
    sidebarWidth: width >= 1024 ? 220 : 64,
    /** Number of stat cards visible at once (hints ScrollView width) */
    statCardWidth: width >= 1024 ? 180 : 150,
    /** Hero font size scales with screen */
    heroFontSize: width >= 1024 ? 42 : width >= 640 ? 34 : 28,
  };
}
