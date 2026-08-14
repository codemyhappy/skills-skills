import { defineConfig } from 'tsup';

export default defineConfig((options) => ({
  entry: {
    ss: 'src/cli.ts',
  },
  outDir: 'bin',
  format: ['esm'],
  target: 'node18',
  // dev（--watch）时不清理输出目录，便于持续增量构建
  clean: !options.watch,
  splitting: false,
  // dev 开启 sourcemap 便于调试；build（发布）关闭，保持产物干净
  sourcemap: !!options.watch,
  dts: false,
  banner: {
    js: '#!/usr/bin/env node',
  },
}));