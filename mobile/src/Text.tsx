import { Platform, StyleSheet, Text as RNText, TextInput as RNTextInput, TextInputProps, TextProps } from "react-native";

// Android only: the phone's own font looks different from the iPhone's, so Android bundles Inter,
// which is very close to the iPhone font. iPhone and web are left exactly as approved.
export const ANDROID_BODY_FONTS = { regular: "Inter_400Regular", semibold: "Inter_600SemiBold", bold: "Inter_700Bold" } as const;

export function bodyStyle(style: any) {
  if (Platform.OS !== "android") return style;
  const f: any = StyleSheet.flatten(style) || {};
  if (f.fontFamily) return style; // headline text keeps its own font
  const { fontWeight, ...rest } = f;
  const n = fontWeight === "bold" ? 700 : fontWeight === "normal" || !fontWeight ? 400 : parseInt(String(fontWeight), 10) || 400;
  const fontFamily = n >= 700 ? ANDROID_BODY_FONTS.bold : n >= 500 ? ANDROID_BODY_FONTS.semibold : ANDROID_BODY_FONTS.regular;
  return { ...rest, fontFamily }; // fontWeight dropped: the font file already has the weight (no fake bold)
}

export function Text(props: TextProps) { return <RNText {...props} style={bodyStyle(props.style)} />; }
export function TextInput(props: TextInputProps) { return <RNTextInput {...props} style={bodyStyle(props.style)} />; }
