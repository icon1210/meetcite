/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Full address of the MeetMind API when the website is hosted separately (empty = same site). */
  readonly VITE_API_URL?: string;
}
