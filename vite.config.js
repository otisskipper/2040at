import { defineConfig, loadEnv } from 'vite';

/**
 * The OAuth client metadata document must be served at exactly the URL used as
 * the client_id, and every URL inside it must agree. Generating it from one
 * value removes the classic three-places-to-edit footgun.
 */
function clientMetadata(siteUrl) {
  const origin = siteUrl.replace(/\/$/, '');
  const json = JSON.stringify(
    {
      client_id: `${origin}/client-metadata.json`,
      client_name: '2040AT',
      client_uri: origin,
      redirect_uris: [`${origin}/`],
      scope: 'atproto transition:generic',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      application_type: 'web',
      dpop_bound_access_tokens: true,
    },
    null,
    2
  );

  return {
    name: '2040at-client-metadata',
    configureServer(server) {
      server.middlewares.use('/client-metadata.json', (_req, res) => {
        res.setHeader('content-type', 'application/json');
        res.end(json);
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'client-metadata.json', source: json });
    },
  };
}

// The canonical public origin. Deliberately pinned rather than derived from
// VERCEL_PROJECT_PRODUCTION_URL: that variable reports whichever hostname Vercel
// considers primary, which is not necessarily the domain users arrive on, and a
// mismatch silently sends the OAuth redirect to the wrong site.
const SITE_URL = 'https://2040at.vercel.app';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = env.VITE_SITE_URL || SITE_URL;

  return {
    define: {
      __SITE_URL__: JSON.stringify(siteUrl),
    },
    plugins: [clientMetadata(siteUrl)],
    build: { target: 'esnext' },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    preview: { host: '127.0.0.1', port: 5173, strictPort: true },
  };
});
