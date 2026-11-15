import React from "react";
import { View, Image, StyleSheet } from "react-native";

const logoAsset = require("../../assets/logo.png");

export default function AppLogo({ size = 44, rounded = true, style }) {
  const borderRadius = rounded ? Math.round(size * 0.24) : 0;

  return (
    <View
      style={[
        styles.wrapper,
        {
          width: size,
          height: size,
          borderRadius
        },
        style
      ]}
    >
      <Image
        source={logoAsset}
        style={{
          width: size,
          height: size,
          borderRadius
        }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
    backgroundColor: "#064e3b",
    borderWidth: 1.5,
    borderColor: "rgba(52, 211, 153, 0.5)",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 4
  }
});

