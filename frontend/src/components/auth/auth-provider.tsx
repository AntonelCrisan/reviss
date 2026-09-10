"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTheme } from "@/components/theme-provider";
import {
  AuthApiError,
  type AuthUser,
  getCurrentUser,
  logout as logoutRequest,
} from "@/lib/auth-api";
import { useLanguage } from "@/components/language-provider";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  setUser: (user: AuthUser | null) => void;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { setTheme } = useTheme();
  const { setLanguage } = useLanguage();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const appliedThemeRef = useRef<AuthUser["theme_preference"] | null>(null);
  const appliedLanguageRef = useRef<AuthUser["language_preference"] | null>(
    null,
  );

  useEffect(() => {
    let isMounted = true;

    getCurrentUser()
      .then((currentUser) => {
        if (isMounted) setUser(currentUser);
      })
      .catch((error: unknown) => {
        if (isMounted && error instanceof AuthApiError && error.status === 401) {
          setTheme("system");
        }
        if (
          isMounted &&
          (!(error instanceof AuthApiError) || error.status !== 401)
        ) {
          console.error("Could not verify the current session.", error);
        }
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [setTheme]);

  /**
   * Applies the account's stored theme and language.
   *
   * Keyed on the stored values, not on the user object: a name change, a plan
   * refresh or a project update all replace that object, and re-applying here
   * would snap the interface back to what the account holds -- switching a
   * visitor reading in dark mode back to light in the middle of a save.
   */
  useEffect(() => {
    if (!user) {
      appliedThemeRef.current = null;
      appliedLanguageRef.current = null;
      return;
    }

    if (appliedThemeRef.current !== user.theme_preference) {
      appliedThemeRef.current = user.theme_preference;
      setTheme(user.theme_preference);
    }

    if (appliedLanguageRef.current !== user.language_preference) {
      appliedLanguageRef.current = user.language_preference;
      setLanguage(user.language_preference);
    }
  }, [setLanguage, setTheme, user]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLoading,
      setUser,
      logout: async () => {
        await logoutRequest();
        setUser(null);
        setTheme("system");
      },
    }),
    [isLoading, setTheme, user],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
