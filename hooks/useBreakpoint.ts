import { useWindowDimensions } from 'react-native';

/**
 * Returns layout breakpoints based on current window width.
 *
 * Mobile  < 640 px     — phones / very small screens
 * Tablet  640 – 767 px — portrait tablet / large phone
 * Medium  768 – 1023 px — landscape tablet / small laptop  ← new
 * Desktop ≥ 1024 px
 */
export function useBreakpoint() {
  const { width, height } = useWindowDimensions();
  return {
    width,
    height,
    isMobile:  width < 640,
    isTablet:  width >= 640 && width < 768,
    isMedium:  width >= 768 && width < 1024,
    isDesktop: width >= 1024,
    /** Show right-panel sidebar: medium + desktop (≥ 768) */
    showRightPanel: width >= 768,
    /** Right panel width — narrower on medium to give room to main content */
    rightPanelWidth: width >= 1024 ? 300 : 220,
    /** Full sidebar: ≥ 1024; compact icon sidebar: < 1024 */
    sidebarWidth: width >= 1024 ? 220 : 64,
    /** Stat card fixed width for horizontal scroll (mobile only) */
    statCardWidth: width >= 1024 ? 180 : 150,
    /** Hero font size scales with screen */
    heroFontSize: width >= 1024 ? 42 : width >= 768 ? 38 : width >= 640 ? 34 : 28,
  };
}
