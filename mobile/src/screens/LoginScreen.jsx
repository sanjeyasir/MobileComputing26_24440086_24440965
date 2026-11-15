import React, { useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  ScrollView,
  Platform,
  ActivityIndicator
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import AppLogo from "../components/AppLogo";
import { useCutter } from "../context/CutterContext";
import { useResponsive } from "../utils/responsive";

export default function LoginScreen() {
  const { login, currentTimeSLST } = useCutter();
  const insets = useSafeAreaInsets();
  const { isSmallPhone, isTablet, rf, containerPadding } = useResponsive();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = () => {
    setErrorMsg(null);
    if (!username.trim() || !password.trim()) {
      setErrorMsg("Please enter both username and password.");
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      const result = login(username, password);
      setIsSubmitting(false);
      if (!result.success) {
        setErrorMsg(result.error);
      }
    }, 200);
  };

  const handleQuickFill = () => {
    setUsername("admin");
    setPassword("admin");
    setErrorMsg(null);
  };

  return (
    <View style={styles.wrapper}>
      <KeyboardAvoidingView
        style={{ flex: 1, width: "100%" }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: Math.max(insets.top + 20, 36),
              paddingBottom: Math.max(insets.bottom + 24, 32),
              paddingHorizontal: containerPadding
            }
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Bootstrap-style Centered Login Card */}
          <View style={[styles.loginCard, isTablet && styles.loginCardTablet]}>
            {/* Emerald Card Header (.tcl-login-header) */}
            <View style={styles.loginHeader}>
              <View style={styles.logoBox}>
                <AppLogo size={isSmallPhone ? 58 : 64} />
              </View>
              <View style={styles.sectorBadge}>
                <Text style={[styles.sectorBadgeText, { fontSize: rf(10) }]}>
                  HAYLEYS ECO SOLUTIONS SECTOR
                </Text>
              </View>
              <Text style={[styles.companyTitle, { fontSize: rf(18) }]}>
                TOYO CUSHION LANKA (PVT) LTD
              </Text>
              <Text style={[styles.portalSubtitle, { fontSize: rf(11) }]}>
                Rubberised Coir Cutter • Volume & Downtime Portal
              </Text>
            </View>

            {/* Card Body */}
            <View style={styles.cardBody}>
              <Text style={[styles.formTitle, { fontSize: rf(17) }]}>
                Operator & Admin Sign In
              </Text>
              <Text style={[styles.formSubtitle, { fontSize: rf(12) }]}>
                Enter your credentials to access hourly volume & downtime logs.
              </Text>

              {errorMsg && (
                <View style={styles.alertDanger}>
                  <Text style={[styles.alertDangerText, { fontSize: rf(12) }]}>
                    {errorMsg}
                  </Text>
                </View>
              )}

              {/* Username Form Group */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { fontSize: rf(11) }]}>
                  USERNAME
                </Text>
                <TextInput
                  style={[styles.formControl, { fontSize: rf(14) }]}
                  placeholder="Enter username (admin)"
                  placeholderTextColor="#94a3b8"
                  value={username}
                  onChangeText={(val) => {
                    setUsername(val);
                    if (errorMsg) setErrorMsg(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                />
              </View>

              {/* Password Form Group with InputGroup Show/Hide button */}
              <View style={styles.formGroup}>
                <Text style={[styles.formLabel, { fontSize: rf(11) }]}>
                  PASSWORD
                </Text>
                <View style={styles.inputGroup}>
                  <TextInput
                    style={[styles.inputGroupControl, { fontSize: rf(14) }]}
                    placeholder="Enter password (admin)"
                    placeholderTextColor="#94a3b8"
                    value={password}
                    onChangeText={(val) => {
                      setPassword(val);
                      if (errorMsg) setErrorMsg(null);
                    }}
                    secureTextEntry={!showPassword}
                    autoCapitalize="none"
                    autoCorrect={false}
                    onSubmitEditing={handleLogin}
                  />
                  <TouchableOpacity
                    style={styles.inputGroupBtn}
                    onPress={() => setShowPassword(!showPassword)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.inputGroupBtnText, { fontSize: rf(12) }]}>
                      {showPassword ? "Hide" : "Show"}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Sign In Button (Bootstrap variant="success" size="lg") */}
              <TouchableOpacity
                style={styles.btnSuccessLg}
                onPress={handleLogin}
                disabled={isSubmitting}
                activeOpacity={0.85}
              >
                {isSubmitting ? (
                  <ActivityIndicator size="small" color="#ffffff" />
                ) : (
                  <Text style={[styles.btnSuccessLgText, { fontSize: rf(15) }]}>
                    Sign In to Dashboard
                  </Text>
                )}
              </TouchableOpacity>

              {/* Footer Demo Login Row */}
              <View style={styles.footerRow}>
                <Text style={[styles.demoText, { fontSize: rf(12) }]}>
                  Demo Login: <Text style={styles.codeText}>admin</Text> /{" "}
                  <Text style={styles.codeText}>admin</Text>
                </Text>
                <TouchableOpacity onPress={handleQuickFill} activeOpacity={0.7}>
                  <Text style={[styles.autoFillLink, { fontSize: rf(12) }]}>
                    Auto-fill admin
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <Text style={[styles.slstFooter, { fontSize: rf(11) }]}>
            Sri Lanka Standard Time (SLST): {currentTimeSLST.timeString}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
    backgroundColor: "#064e3b"
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center"
  },
  loginCard: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: "#ffffff",
    borderRadius: 20,
    overflow: "hidden",
    elevation: 12,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.35,
    shadowRadius: 24
  },
  loginCardTablet: {
    maxWidth: 460
  },
  loginHeader: {
    backgroundColor: "#047857",
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: "center"
  },
  logoBox: {
    width: 74,
    height: 74,
    borderRadius: 18,
    backgroundColor: "#ffffff",
    padding: 5,
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8
  },
  sectorBadge: {
    backgroundColor: "#f8fafc",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 6,
    marginBottom: 8
  },
  sectorBadgeText: {
    color: "#0f172a",
    fontWeight: "800",
    letterSpacing: 0.4
  },
  companyTitle: {
    color: "#ffffff",
    fontWeight: "900",
    textAlign: "center"
  },
  portalSubtitle: {
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 4,
    textAlign: "center",
    fontWeight: "500"
  },
  cardBody: {
    padding: 22
  },
  formTitle: {
    color: "#0f172a",
    fontWeight: "800"
  },
  formSubtitle: {
    color: "#64748b",
    marginTop: 2,
    marginBottom: 16
  },
  alertDanger: {
    backgroundColor: "#f8d7da",
    borderColor: "#f5c2c7",
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginBottom: 14
  },
  alertDangerText: {
    color: "#842029",
    fontWeight: "700"
  },
  formGroup: {
    marginBottom: 14
  },
  formLabel: {
    color: "#6c757d",
    fontWeight: "800",
    marginBottom: 6,
    letterSpacing: 0.4
  },
  formControl: {
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#212529",
    fontWeight: "500"
  },
  inputGroup: {
    flexDirection: "row",
    alignItems: "stretch"
  },
  inputGroupControl: {
    flex: 1,
    backgroundColor: "#ffffff",
    borderWidth: 1,
    borderColor: "#ced4da",
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: "#212529",
    fontWeight: "500"
  },
  inputGroupBtn: {
    backgroundColor: "#f8f9fa",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderRightWidth: 1,
    borderColor: "#6c757d",
    borderTopRightRadius: 8,
    borderBottomRightRadius: 8,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center"
  },
  inputGroupBtnText: {
    color: "#6c757d",
    fontWeight: "700"
  },
  btnSuccessLg: {
    backgroundColor: "#198754",
    borderRadius: 8,
    paddingVertical: 13,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
    marginBottom: 14
  },
  btnSuccessLgText: {
    color: "#ffffff",
    fontWeight: "800"
  },
  footerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#dee2e6"
  },
  demoText: {
    color: "#6c757d"
  },
  codeText: {
    color: "#d63384",
    fontWeight: "800",
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace"
  },
  autoFillLink: {
    color: "#198754",
    fontWeight: "800"
  },
  slstFooter: {
    color: "rgba(255, 255, 255, 0.65)",
    marginTop: 16,
    textAlign: "center"
  }
});
