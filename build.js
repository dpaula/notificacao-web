const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');

async function build() {
  const distDir = 'dist';
  // Ensure the dist directory is clean
  await fs.rm(distDir, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(distDir, { recursive: true });

  // Build JavaScript/TypeScript
  await esbuild.build({
    entryPoints: ['index.tsx'],
    bundle: true,
    minify: true,
    sourcemap: true,
    outfile: path.join(distDir, 'index.js'),
    define: { 'process.env.NODE_ENV': '"production"' },
    loader: { '.tsx': 'tsx' },
  }).catch(() => process.exit(1));

  // Process and copy index.html for production
  let html = await fs.readFile('index.html', 'utf-8');
  
  // 1. Remove the importmap script tag used for development
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
  
  // 2. Change the script source from the .tsx file to the bundled .js file
  html = html.replace('src="/index.tsx"', 'src="/index.js"');
  
  await fs.writeFile(path.join(distDir, 'index.html'), html);

  // Copy the service worker file to the dist directory
  await fs.copyFile('sw.js', path.join(distDir, 'sw.js'));

  console.log('Build finished successfully and output to /dist');
}

build();