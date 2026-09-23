import { isIOS } from './platform'

let label: HTMLLabelElement | undefined

/**
 * A light tap. iOS Safari has no vibration API, but toggling an `<input switch>`
 * (iOS 18+) plays the system selection haptic, so we click a hidden one.
 */
export function haptic() {
  if (!isIOS()) {
    navigator.vibrate?.(8)
    return
  }
  if (!label) {
    const input = Object.assign(document.createElement('input'), { type: 'checkbox', id: 'haptic-switch' })
    input.setAttribute('switch', '')
    input.hidden = true
    label = Object.assign(document.createElement('label'), { htmlFor: 'haptic-switch', hidden: true })
    document.body.append(input, label)
  }
  label.click()
}
