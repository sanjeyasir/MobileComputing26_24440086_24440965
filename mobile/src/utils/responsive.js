import { useWindowDimensions, Platform, PixelRatio } from "react-native";

/**
 * Responsive layout hook for Android phones (compact, standard, phablet, foldable/tablet) & Web
 */
export function useResponsive() {
  const { width, height } = useWindowDimensions();

  const isSmallPhone = width < 360;
  const isCompactPhone = width < 390;
  const isTablet = width >= 600;
  const isDesktop = width >= 960;
  const isLandscape = width > height;

  // Responsive font size helper
  const rf = (size) => {
    if (isSmallPhone) return Math.max(9, Math.round(size * 0.88));
    if (isCompactPhone) return Math.max(10, Math.round(size * 0.94));
    if (isDesktop) return Math.round(size * 1.05);
    return size;
  };

  // Horizontal container padding
  const containerPadding = isSmallPhone ? 10 : isCompactPhone ? 12 : isTablet ? 20 : 14;

  // Inner card padding
  const cardPadding = isSmallPhone ? 12 : isCompactPhone ? 14 : 16;

  // Width percentage for 2-column metric cards on phones vs multi-column on tablets
  const metricCardWidth = isDesktop
    ? "18.8%"
    : isTablet
    ? "31.5%"
    : isSmallPhone
    ? "100%"
    : "48%";

  return {
    width,
    height,
    isSmallPhone,
    isCompactPhone,
    isTablet,
    isDesktop,
    isLandscape,
    rf,
    containerPadding,
    cardPadding,
    metricCardWidth,
    isWeb: Platform.OS === "web",
    pixelRatio: PixelRatio.get()
  };
}

