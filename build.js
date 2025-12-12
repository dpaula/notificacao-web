require('dotenv').config();
const esbuild = require('esbuild');
const fs = require('fs/promises');
const path = require('path');

async function build() {
  const distDir = 'dist';

  // Read VAPID public key from environment variables
  const vapidPublicKey = process.env.VITE_VAPID_PUBLIC_KEY;
  const chatkitWorkflowId = process.env.VITE_CHATKIT_WORKFLOW_ID || '';

  if (!vapidPublicKey) {
    console.error('\x1b[31m%s\x1b[0m', 'Error: VITE_VAPID_PUBLIC_KEY environment variable is not set.');
    console.error('Please provide the VAPID public key to build the application.');
    process.exit(1);
  }

  if (!chatkitWorkflowId) {
    console.warn('\x1b[33m%s\x1b[0m', 'Warning: VITE_CHATKIT_WORKFLOW_ID is not set. The ChatKit page will display a placeholder workflow id.');
  }

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
    define: { 
      'process.env.NODE_ENV': '"production"',
      // Inject env variables into the frontend bundle via import.meta.env
      'import.meta.env.VITE_VAPID_PUBLIC_KEY': JSON.stringify(vapidPublicKey),
      'import.meta.env.VITE_CHATKIT_WORKFLOW_ID': JSON.stringify(chatkitWorkflowId),
    },
    loader: {
      '.tsx': 'tsx',
      '.ts': 'ts',
      '.css': 'css',
    },
  }).catch(() => process.exit(1));

  // Process and copy index.html for production
  let html = await fs.readFile('index.html', 'utf-8');
  
  // 1. Remove the importmap script tag used for development
  html = html.replace(/<script type="importmap">[\s\S]*?<\/script>/, '');
  
  // 2. Change the script source from the .tsx file to the bundled .js file
  html = html.replace('src="/index.tsx"', 'src="/index.js"');

  // 3. Ensure bundled CSS is loaded (esbuild outputs dist/index.css)
  if (!html.includes('href="/index.css"')) {
    html = html.replace(
      /<\/head>/,
      '    <link rel="stylesheet" href="/index.css" />\n  </head>'
    );
  }
  
  await fs.writeFile(path.join(distDir, 'index.html'), html);

  // Copy the service worker file to the dist directory
  await fs.copyFile('sw.js', path.join(distDir, 'sw.js'));

  console.log('Build finished successfully and output to /dist');
}

build();
