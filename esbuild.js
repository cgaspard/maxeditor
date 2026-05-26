const esbuild = require('esbuild');

const production = process.argv.includes('--production');
const watch = process.argv.includes('--watch');
const includeTests = process.argv.includes('--tests');

async function main() {
  const builds = [
    esbuild.context({
      entryPoints: ['src/extension.ts'],
      bundle: true,
      format: 'cjs',
      minify: production,
      sourcemap: !production,
      sourcesContent: false,
      platform: 'node',
      outfile: 'dist/extension.js',
      external: ['vscode'],
      logLevel: 'info',
    }),
  ];

  if (includeTests || !production) {
    builds.push(
      esbuild.context({
        entryPoints: [
          'src/test/runTests.ts',
          'src/test/suite/index.ts',
          'src/test/suite/extension.test.ts',
        ],
        bundle: true,
        format: 'cjs',
        sourcemap: true,
        sourcesContent: false,
        platform: 'node',
        outdir: 'dist/test',
        external: ['vscode', 'mocha'],
        logLevel: 'info',
      }),
    );
  }

  const ctxs = await Promise.all(builds);

  if (watch) {
    await Promise.all(ctxs.map(c => c.watch()));
    console.log('[watch] watching for changes...');
  } else {
    for (const ctx of ctxs) {
      await ctx.rebuild();
      await ctx.dispose();
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
