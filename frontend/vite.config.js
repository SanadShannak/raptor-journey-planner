import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // This forces Vite to resolve these exact packages to a single instance
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    // This forces Vite to pre-bundle the Leaflet packages with the correct React instance
    include: ["react-leaflet", "leaflet"],
  },
});
