/**
 * [INPUT]: The runtime random number generator.
 * [OUTPUT]: One equally likely confetti or emoji shape for a complete burst.
 * [POS]: Platform-free selection shared by both mobile cannons; no persisted state.
 * [PROTOCOL]: Update this header when making changes, then check README.md.
 */
export const celebrationShapes = [null, '🎉', '❤️', '✨', '🎊', '⭐️', '🌈', '🔥', '🥳'] as const

export function chooseCelebrationShape() {
  return celebrationShapes[Math.floor(Math.random() * celebrationShapes.length)] ?? null
}
