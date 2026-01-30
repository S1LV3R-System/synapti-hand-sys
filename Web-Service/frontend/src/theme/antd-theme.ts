import type { ThemeConfig } from 'antd';

/**
 * SynaptiHand Admin Portal Theme
 *
 * Brand colors extracted from official logo:
 * - Cyan: #4DC9E6 (accent, highlights)
 * - Teal: #1E90B5 (primary brand color)
 * - Navy: #1B3A5F (text, dark elements)
 * - Blue: #3498DB (interactive elements)
 */

// Brand color constants
export const brandColors = {
  cyan: '#4DC9E6',
  teal: '#1E90B5',
  navy: '#1B3A5F',
  blue: '#3498DB',
  nodeDark: '#1A2744',
  nodeLight: '#50A0D0',
};

export const antdTheme: ThemeConfig = {
  token: {
    // Primary Colors - SynaptiHand Brand
    colorPrimary: brandColors.teal,
    colorSuccess: '#00c48c',
    colorWarning: '#f5a623',
    colorError: '#ee0000',
    colorInfo: brandColors.cyan,

    // Link color
    colorLink: brandColors.teal,
    colorLinkHover: brandColors.cyan,
    colorLinkActive: brandColors.navy,

    // Neutral Colors
    colorBgBase: '#ffffff',
    colorBgContainer: '#fafafa',
    colorBgElevated: '#ffffff',
    colorBorder: '#eaeaea',
    colorBorderSecondary: '#f0f0f0',

    // Text Colors - Navy for headers
    colorText: brandColors.navy,
    colorTextSecondary: '#666666',
    colorTextTertiary: '#999999',
    colorTextQuaternary: '#cccccc',

    // Typography
    fontSize: 14,
    fontSizeHeading1: 36,
    fontSizeHeading2: 28,
    fontSizeHeading3: 22,
    fontSizeHeading4: 18,
    fontSizeHeading5: 16,
    fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',

    // Spacing
    borderRadius: 8,
    borderRadiusLG: 12,
    borderRadiusSM: 6,
    borderRadiusXS: 4,

    // Layout
    lineHeight: 1.5,

    // Component Specific
    controlHeight: 36,
    controlHeightLG: 44,
    controlHeightSM: 28,

    // Motion
    motionDurationSlow: '0.3s',
    motionDurationMid: '0.2s',
    motionDurationFast: '0.1s',
  },

  components: {
    // Button
    Button: {
      primaryShadow: '0 2px 0 rgba(30, 144, 181, 0.1)',
      borderRadius: 8,
      controlHeight: 36,
      fontWeight: 500,
    },

    // Table
    Table: {
      headerBg: '#fafafa',
      headerColor: brandColors.navy,
      headerSortActiveBg: '#f0f0f0',
      rowHoverBg: '#fafafa',
      borderRadius: 8,
      padding: 16,
      paddingContentVertical: 12,
    },

    // Card
    Card: {
      borderRadius: 12,
      boxShadow: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.06)',
      headerBg: 'transparent',
      headerFontSize: 18,
      headerFontSizeSM: 16,
      paddingLG: 24,
    },

    // Input
    Input: {
      borderRadius: 8,
      controlHeight: 36,
      paddingBlock: 8,
      paddingInline: 12,
      activeBorderColor: brandColors.teal,
      hoverBorderColor: brandColors.cyan,
    },

    // Select
    Select: {
      borderRadius: 8,
      controlHeight: 36,
    },

    // Modal
    Modal: {
      borderRadius: 12,
      headerBg: 'transparent',
      titleFontSize: 20,
      contentBg: '#ffffff',
      footerBg: 'transparent',
    },

    // Drawer
    Drawer: {
      footerPaddingBlock: 16,
      footerPaddingInline: 24,
    },

    // Tabs
    Tabs: {
      itemActiveColor: brandColors.teal,
      itemHoverColor: brandColors.cyan,
      itemSelectedColor: brandColors.teal,
      inkBarColor: brandColors.teal,
      titleFontSize: 14,
      cardBg: '#fafafa',
    },

    // Badge
    Badge: {
      statusSize: 8,
      dotSize: 8,
    },

    // Tag
    Tag: {
      borderRadiusSM: 6,
      defaultBg: '#fafafa',
      defaultColor: brandColors.navy,
    },

    // Alert
    Alert: {
      borderRadius: 8,
      colorInfoBg: '#e6f7fb',
      colorInfoBorder: '#b3e6f2',
      colorSuccessBg: '#e6fff5',
      colorSuccessBorder: '#b3f5d9',
      colorWarningBg: '#fffbf0',
      colorWarningBorder: '#ffe7ba',
      colorErrorBg: '#fff0f0',
      colorErrorBorder: '#ffdbdb',
    },

    // Pagination
    Pagination: {
      itemActiveBg: brandColors.teal,
      itemSize: 32,
      borderRadius: 6,
    },

    // Tooltip
    Tooltip: {
      borderRadius: 6,
      colorBgSpotlight: brandColors.navy,
    },

    // Dropdown
    Dropdown: {
      borderRadius: 8,
      controlItemBgHover: '#fafafa',
      controlItemBgActive: '#f0f0f0',
      paddingBlock: 8,
    },

    // Timeline
    Timeline: {
      tailColor: '#eaeaea',
      dotBorderWidth: 2,
    },

    // Steps
    Steps: {
      controlItemBgActive: brandColors.teal,
      colorPrimary: brandColors.teal,
      dotSize: 32,
      iconSize: 32,
    },

    // Menu
    Menu: {
      itemSelectedBg: '#e6f7fb',
      itemSelectedColor: brandColors.teal,
      itemHoverBg: '#f5f5f5',
    },

    // Layout
    Layout: {
      siderBg: '#ffffff',
      headerBg: '#ffffff',
    },
  },
};

// Dark mode theme (for future implementation)
export const antdDarkTheme: ThemeConfig = {
  ...antdTheme,
  token: {
    ...antdTheme.token,
    colorBgBase: '#0a0a0a',
    colorBgContainer: '#141414',
    colorBgElevated: '#1a1a1a',
    colorBorder: '#333333',
    colorBorderSecondary: '#222222',
    colorText: '#ffffff',
    colorTextSecondary: '#a0a0a0',
    colorTextTertiary: '#707070',
    colorTextQuaternary: '#505050',
  },
};

// Color palette for charts and visualizations
export const chartColors = {
  primary: brandColors.teal,
  secondary: brandColors.cyan,
  accent: brandColors.blue,
  success: '#00c48c',
  warning: '#f5a623',
  error: '#ee0000',
  info: brandColors.cyan,
  purple: '#7928ca',
  pink: '#ff0080',
  cyan: brandColors.cyan,
  lime: '#a4e92f',
  orange: '#ff6b35',
  navy: brandColors.navy,
};

// Status colors
export const statusColors = {
  pending: '#f5a623',
  processing: '#f5a623',
  approved: '#00c48c',
  completed: '#00c48c',
  rejected: '#ee0000',
  failed: '#ee0000',
  active: '#00c48c',
  inactive: '#888888',
  verified: brandColors.teal,
  unverified: '#999999',
  warning: '#faad14',
};

// Gradient for special elements
export const brandGradient = {
  primary: `linear-gradient(135deg, ${brandColors.cyan} 0%, ${brandColors.teal} 100%)`,
  dark: `linear-gradient(135deg, ${brandColors.teal} 0%, ${brandColors.navy} 100%)`,
};
