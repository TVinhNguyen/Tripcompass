"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { MotionConfig } from "framer-motion"
import { GoogleOAuthProvider } from "@react-oauth/google"
import { AuthProvider } from "@/hooks/use-auth"

const GoogleOAuthReadyContext = createContext(false)

export function useGoogleOAuthReady() {
  return useContext(GoogleOAuthReadyContext)
}

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [googleClientId, setGoogleClientId] = useState("")

  useEffect(() => {
    let cancelled = false

    fetch("/runtime-config", { cache: "no-store" })
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled) setGoogleClientId(data.googleClientId || "")
      })
      .catch(() => {
        if (!cancelled) setGoogleClientId("")
      })

    return () => {
      cancelled = true
    }
  }, [])

  const app = (
    <GoogleOAuthReadyContext.Provider value={Boolean(googleClientId)}>
      <AuthProvider>
        {children}
      </AuthProvider>
    </GoogleOAuthReadyContext.Provider>
  )

  // No theme system / dark mode — the app ships light-only by product
  // decision. MotionConfig reducedMotion="user" makes every framer-motion
  // animation honor prefers-reduced-motion (WCAG 2.3.3) in one place.
  return (
    <MotionConfig reducedMotion="user">
      {googleClientId ? (
        <GoogleOAuthProvider clientId={googleClientId}>{app}</GoogleOAuthProvider>
      ) : (
        app
      )}
    </MotionConfig>
  )
}
