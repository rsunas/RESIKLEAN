// Ambient asset/env types for the focused checkJs login check (Vite JavaScript app).
declare module '*.webp' { const url: string; export default url; }
declare module '*.png' { const url: string; export default url; }
declare module '*.css';
interface ImportMeta { readonly env: { readonly VITE_API_URL?: string }; }
