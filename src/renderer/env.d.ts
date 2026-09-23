import type { GoalloomApi } from '../shared/contracts/runtime'

declare global {
  interface Window { goalloom?: GoalloomApi }
}
