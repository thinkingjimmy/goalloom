/**
 * [INPUT]: Editable text, typography, available width and native input props.
 * [OUTPUT]: A multiline input sized by an identically styled, accessibility-hidden text measure.
 * [POS]: Task-detail text sizing; avoids platform-dependent content-size events clipping saved lines.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
import { useState } from 'react'
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native'

type Props = Omit<TextInputProps, 'multiline' | 'scrollEnabled' | 'onContentSizeChange'> & {
  containerStyle?: StyleProp<ViewStyle>
}

export function GrowingTaskInput({ value, style, containerStyle, ...props }: Props) {
  const [height, setHeight] = useState(44)
  return <View style={[styles.field, containerStyle]}>
    <Text accessible={false} aria-hidden importantForAccessibility="no-hide-descendants" pointerEvents="none"
      onLayout={event => setHeight(Math.max(44, Math.ceil(event.nativeEvent.layout.height)))} style={[style, styles.measure]}>
      {`${value || props.placeholder || ''}\u200b`}
    </Text>
    <TextInput {...props} value={value} multiline scrollEnabled={false} style={[style, { height }]} />
  </View>
}

const styles = StyleSheet.create({
  field: { minWidth: 0 },
  measure: { position: 'absolute', top: 0, left: 0, right: 0, opacity: 0 },
})
