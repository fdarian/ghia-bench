import '@ghia/native/host'
import type { Props } from '@ghia/react'

// Ghia typing gaps, see the report: host props have no `className` (the reconciler maps it to the
// `class` attribute its CSS engine matches, and `stylex.props()` returns one), and `<style>`, which
// the docs say works in React, is not a JSX intrinsic element.
declare module '@ghia/native/host' {
  interface HostProps {
    className?: string
  }
}

declare module '@ghia/react/jsx-runtime' {
  namespace JSX {
    interface IntrinsicElements {
      style: Props
    }
  }
}
