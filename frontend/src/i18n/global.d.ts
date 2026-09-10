import type messages from "../../messages/ro.json";
import type { locales } from "./config";

declare module "next-intl" {
  interface AppConfig {
    Locale: (typeof locales)[number];
    // Romanian is the source language: every key must exist there, so it is
    // the file the key types are derived from.
    Messages: typeof messages;
  }
}
