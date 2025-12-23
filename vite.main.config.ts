import type { ConfigEnv, UserConfig } from "vite";
import { defineConfig, mergeConfig, loadEnv } from "vite";
import { getBuildConfig, getBuildDefine, external, pluginHotRestart } from "./vite.base.config";
import path from "path";

// https://vitejs.dev/config
export default defineConfig((env) => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const forgeEnv = env as any;
  const { forgeConfigSelf } = forgeEnv;
  const define = getBuildDefine(forgeEnv);

  // Load environment variables
  const loadedEnv = loadEnv(forgeEnv.mode, process.cwd(), "");


  const config: UserConfig = {
    build: {
      lib: {
        entry: forgeConfigSelf.entry!,
        fileName: () => "[name].js",
        formats: ["cjs"],
      },
      rollupOptions: {
        external: external,
      },
    },
    plugins: [pluginHotRestart("restart")],
    define,
    resolve: {
      // Load the Node.js entry.
      mainFields: ["module", "jsnext:main", "jsnext"],
      preserveSymlinks: true,
      alias: {
        "@": path.resolve(__dirname, "src"),
      },
    },
  };

  return mergeConfig(getBuildConfig(forgeEnv), config);
});
