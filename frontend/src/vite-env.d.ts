/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full address of the MeetCite API when the website is hosted separately (empty = same site). */
  readonly VITE_API_URL?: string;
}
