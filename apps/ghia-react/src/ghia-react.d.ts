import '@ghia/native/host'

// Ghia gap: its host props have no `className`, although the reconciler maps it to the `class`
// attribute that its CSS engine matches. `stylex.props()` returns one.
declare module '@ghia/native/host' {
  interface HostProps {
    className?: string
  }
}
