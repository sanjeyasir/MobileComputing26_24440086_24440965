// Theme configuration matching the premium aesthetic of costing-sample-tracking

export const themeConfig = {
  token: {
    colorPrimary: "#059669", // Toyo Cushion Lanka Emerald
    colorSuccess: "#10b981", // Emerald green
    colorWarning: "#f59e0b", // Amber yellow
    colorError: "#ef4444",   // Red error
    colorInfo: "#0284c7",    // Blue info
    colorBgBase: "#f8fafc",  // Light base background
    colorBgContainer: "#ffffff", // White container background
    borderRadius: 12,
    fontFamily: '"Outfit", "Inter", "Roboto", sans-serif',
  },
  components: {
    Button: {
      borderRadius: 8,
      fontWeight: 600,
      controlHeight: 38,
    },
    Card: {
      borderRadiusLG: 16,
    },
    Table: {
      borderRadiusLG: 12,
      headerBg: "#f8fafc",
      headerColor: "#475569",
      headerSortActiveBg: "#f1f5f9",
    },
    Tag: {
      borderRadiusSM: 6,
    },
    Input: {
      borderRadius: 8,
      controlHeight: 38,
    },
    Select: {
      borderRadius: 8,
      controlHeight: 38,
    }
  }
};
