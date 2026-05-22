"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { apiFetch } from "@/lib/api"
import type { Place } from "@/lib/types"
import { useAuth } from "@/hooks/use-auth"

export function useSavedPlaces() {
  const { user, loading: authLoading } = useAuth()
  const [savedPlaces, setSavedPlaces] = useState<Place[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    if (!user) {
      setSavedPlaces([])
      return
    }
    setLoading(true)
    try {
      const { data } = await apiFetch<{ data: Place[] }>("/user/saved-places", { silent401: true })
      setSavedPlaces(data ?? [])
    } catch {
      setSavedPlaces([])
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    if (authLoading) return
    refresh()
  }, [authLoading, refresh])

  const savedIds = useMemo(() => new Set(savedPlaces.map((place) => place.id)), [savedPlaces])

  const setPlaceSaved = useCallback((placeId: string, saved: boolean, place?: Place) => {
    setSavedPlaces((current) => {
      if (saved) {
        if (current.some((item) => item.id === placeId)) return current
        return place ? [place, ...current] : current
      }
      return current.filter((item) => item.id !== placeId)
    })
  }, [])

  return {
    savedPlaces,
    savedIds,
    loading,
    refresh,
    setPlaceSaved,
  }
}
