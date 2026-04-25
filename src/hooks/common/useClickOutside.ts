'use client'

import { useEffect, useCallback, useLayoutEffect, type RefObject } from 'react'

export function useClickOutside(
  refs: RefObject<HTMLElement | null>[],
  handler: () => void,
  enabled = true,
) {
  useEffect(() => {
    if (!enabled) return

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node
      if (refs.some((ref) => ref.current?.contains(target))) return
      handler()
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [refs, handler, enabled])
}

export function useDropdownPosition(
  triggerRef: RefObject<HTMLElement | null>,
  panelRef: RefObject<HTMLElement | null>,
  isOpen: boolean,
) {
  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current
    const panel = panelRef.current
    if (!trigger || !panel) return

    const rect = trigger.getBoundingClientRect()
    const viewportH = window.innerHeight
    const spaceBelow = viewportH - rect.bottom
    const spaceAbove = rect.top
    const panelHeight = panel.scrollHeight || 240

    panel.style.position = 'fixed'
    panel.style.left = `${rect.left}px`
    panel.style.width = `${rect.width}px`

    if (spaceBelow >= panelHeight || spaceBelow >= spaceAbove) {
      panel.style.top = `${rect.bottom + 4}px`
    } else {
      panel.style.top = `${rect.top - panelHeight - 4}px`
    }
  }, [triggerRef, panelRef])

  useLayoutEffect(() => {
    if (!isOpen) return
    updatePosition()
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [isOpen, updatePosition])

  return updatePosition
}
