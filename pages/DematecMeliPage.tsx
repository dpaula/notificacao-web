import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import type { ChatKitOptions } from '@openai/chatkit';

const CHATKIT_SCRIPT_URL = 'https://cdn.platform.openai.com/deployments/chatkit/chatkit.js';

const DematecMeliPage: React.FC = () => {
  const [isWidgetReady, setIsWidgetReady] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return Boolean(window.customElements?.get('openai-chatkit'));
  });
  const [scriptError, setScriptError] = useState<string | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    let isMounted = true;

    const ensureScriptLoaded = () =>
      new Promise<void>((resolve, reject) => {
        if (window.customElements?.get('openai-chatkit')) {
          console.info('[ChatKit] Web component already registered, skipping script injection');
          resolve();
          return;
        }

        const existing = document.querySelector<HTMLScriptElement>('script[data-chatkit-script="true"]');
        const attachListeners = (target: HTMLScriptElement) => {
          const handleLoaded = () => {
            console.info('[ChatKit] chatkit.js loaded successfully', { src: target.src });
            target.removeEventListener('load', handleLoaded);
            target.removeEventListener('error', handleError);
            resolve();
          };
          const handleError = (event: Event) => {
            console.error('[ChatKit] chatkit.js failed to load', {
              src: target.src,
              type: event.type,
              timestamp: new Date().toISOString(),
            });
            target.removeEventListener('load', handleLoaded);
            target.removeEventListener('error', handleError);
            reject(event instanceof Error ? event : new Error(`Falha ao carregar chatkit.js (${event.type})`));
          };
          target.addEventListener('load', handleLoaded);
          target.addEventListener('error', handleError);
        };

        if (existing) {
          console.info('[ChatKit] Reusing existing chatkit script tag', {
            src: existing.src,
            async: existing.async,
            type: existing.type,
          });
          attachListeners(existing);
          return;
        }

        console.info('[ChatKit] Injecting chatkit.js script', {
          src: CHATKIT_SCRIPT_URL,
          timestamp: new Date().toISOString(),
        });

        const script = document.createElement('script');
        script.src = CHATKIT_SCRIPT_URL;
        script.type = 'module';
        script.async = true;
        script.dataset.chatkitScript = 'true';
        attachListeners(script);
        document.head.appendChild(script);
      });

    ensureScriptLoaded()
      .then(() => {
        if (!isMounted) return;
        setScriptError(null);
        setIsWidgetReady(true);
      })
      .catch((error: unknown) => {
        console.error('[ChatKit] script load error (ensureScriptLoaded)', error);
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : 'Não foi possível carregar o componente ChatKit.';
        setScriptError(message);
        setIsWidgetReady(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const getClientSecret = useCallback(
    async (currentSecret: string | null) => {
      try {
        const response = await fetch('/api/chatkit/session', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            // Allow the server to generate a stable user identifier per session.
            reuseExisting: Boolean(currentSecret),
          }),
        });

        if (!response.ok) {
          const detail = await response.text();
          console.error('[ChatKit] /api/chatkit/session returned error', {
            status: response.status,
            statusText: response.statusText,
            detail: detail.slice(0, 500),
          });
          throw new Error(detail || `Falha ao criar sessão no ChatKit. (status ${response.status})`);
        }

        const payload = (await response.json()) as { client_secret?: string };
        if (!payload?.client_secret) {
          throw new Error('Resposta inválida da API: client_secret ausente.');
        }

        setSessionError(null);
        return payload.client_secret;
      } catch (error) {
        console.error('[ChatKit] session error (getClientSecret)', error);
        const message =
          error instanceof Error ? error.message : 'Não foi possível iniciar a sessão do ChatKit.';
        setSessionError(message);
        throw error instanceof Error ? error : new Error(message);
      }
    },
    []
  );

  const chatKitOptions = useMemo<ChatKitOptions>(
    () => ({
      api: {
        getClientSecret,
      },
      theme: {
        colorScheme: 'dark',
        radius: 'pill',
        density: 'normal',
        typography: {
          baseSize: 16,
          fontFamily:
            '"OpenAI Sans", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif',
          fontFamilyMono:
            'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "DejaVu Sans Mono", "Courier New", monospace',
          fontSources: [
            {
              family: 'OpenAI Sans',
              src: 'https://cdn.openai.com/common/fonts/openai-sans/v2/OpenAISans-Regular.woff2',
              weight: 400,
              style: 'normal',
              display: 'swap',
            },
            {
              family: 'OpenAI Sans',
              src: 'https://cdn.openai.com/common/fonts/openai-sans/v2/OpenAISans-Medium.woff2',
              weight: 500,
              style: 'normal',
              display: 'swap',
            },
            {
              family: 'OpenAI Sans',
              src: 'https://cdn.openai.com/common/fonts/openai-sans/v2/OpenAISans-SemiBold.woff2',
              weight: 600,
              style: 'normal',
              display: 'swap',
            },
            {
              family: 'OpenAI Sans',
              src: 'https://cdn.openai.com/common/fonts/openai-sans/v2/OpenAISans-Bold.woff2',
              weight: 700,
              style: 'normal',
              display: 'swap',
            },
          ],
        },
      },
      composer: {
        placeholder: 'Liste 10 pedidos de hoje',
        attachments: {
          enabled: true,
          maxCount: 5,
          maxSize: 10_485_760,
        },
        tools: [
          {
            id: 'search_docs',
            label: 'Search docs',
            shortLabel: 'Docs',
            placeholderOverride: 'Search documentation',
            icon: 'book-open',
            pinned: false,
          },
          {
            id: 'sync_orders',
            label: 'Sincronizar pedidos',
            shortLabel: 'Pedidos',
            placeholderOverride: 'Sincronizar pedidos do Mercado Livre',
            icon: 'sparkle',
            pinned: true,
          },
        ],
      },
      startScreen: {
        greeting: 'Gerencie Pedidos Meli',
        prompts: [
          {
            icon: 'circle-question',
            label: 'O que é o ChatKit?',
            prompt: 'What is ChatKit?',
          },
          {
            icon: 'book-open',
            label: 'Pedidos do dia',
            prompt: 'Liste 10 pedidos de hoje e destaque atrasos ou pendências.',
          },
          {
            icon: 'bolt',
            label: 'Priorizar soluções',
            prompt: 'Quais pedidos exigem ação imediata e por quê?',
          },
          {
            icon: 'check-circle',
            label: 'Status de logística',
            prompt: 'Traga um resumo da logística dos pedidos Meli desta semana.',
          },
          {
            icon: 'analytics',
            label: 'Insights',
            prompt: 'Gere insights sobre performance de atendimento no Mercado Livre.',
          },
        ],
      },
    }),
    [getClientSecret]
  );

  const chatkit = useChatKit(chatKitOptions);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      <header className="bg-slate-900/80 border-b border-slate-800">
        <div className="max-w-6xl mx-auto px-6 py-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Central Dematec · Mercado Livre</h1>
            <p className="text-sm text-slate-300">
              Acompanhe pedidos, responda clientes e acione automações do Agent Builder em tempo real.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-400 hover:text-white"
            >
              ← Voltar para notificações
            </Link>
            <a
              href="https://platform.openai.com/docs/guides/chatkit"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
            >
              Documentação ChatKit
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="max-w-6xl mx-auto flex flex-col gap-6 px-6 py-8 lg:flex-row">
          <section className="flex-1 rounded-3xl border border-slate-800 bg-slate-900/60 shadow-xl backdrop-blur">
            <div className="border-b border-slate-800 px-6 py-4">
              <h2 className="text-lg font-semibold text-white">Assistente Dematec · Mercado Livre</h2>
              <p className="text-xs text-slate-400">
                Conectado ao workflow publicado no Agent Builder. Utilize prompts iniciais ou defina uma estratégia própria.
              </p>
            </div>
            <div className="relative h-[720px] px-2 pb-6 pt-4">
              {!isWidgetReady && (
                <div className="absolute inset-4 rounded-2xl border border-dashed border-slate-700 p-6 text-sm text-slate-300">
                  <p className="font-medium text-slate-200">Carregando ChatKit…</p>
                  <p className="mt-2 text-slate-400">
                    Estamos baixando o widget do CDN da OpenAI. Verifique sua conexão caso esta mensagem persista.
                  </p>
                  {scriptError && (
                    <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">
                      {scriptError}
                    </p>
                  )}
                </div>
              )}
              {isWidgetReady && (
                <ChatKit
                  control={chatkit.control}
                  className="block h-full w-full rounded-2xl border border-slate-800/80 bg-slate-900"
                />
              )}
            </div>
          </section>

          <aside className="w-full max-w-xl space-y-6">
            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Como funciona este painel</h3>
              <ul className="mt-4 space-y-3 text-sm text-slate-300">
                <li>
                  <span className="font-medium text-slate-100">Workflow:</span> usa o ID publicado configurado nas
                  variáveis{' '}
                  <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">CHATKIT_WORKFLOW_ID</code> e{' '}
                  <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">VITE_CHATKIT_WORKFLOW_ID</code>{' '}
                  para iniciar sessões no Agent Builder.
                </li>
                <li>
                  <span className="font-medium text-slate-100">Autenticação:</span> o backend gera um{' '}
                  <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">client_secret</code> efêmero via
                  OpenAI API sempre que você abre o painel.
                </li>
                <li>
                  <span className="font-medium text-slate-100">Ferramentas:</span> `Search docs` procura tutoriais internos;
                  `Sincronizar pedidos` dispara nossa integração Mercado Livre → Agent Builder.
                </li>
                <li>
                  <span className="font-medium text-slate-100">Start screen:</span> prompts sugeridos aceleram briefing de
                  pedidos, logística e insights de SLA.
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-800 bg-slate-900/60 p-6 shadow-lg backdrop-blur">
              <h3 className="text-lg font-semibold text-white">Erros e diagnósticos</h3>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                <p>
                  <span className="font-medium text-slate-100">Widget:</span>{' '}
                  {scriptError ? (
                    <span className="text-red-300">{scriptError}</span>
                  ) : (
                    <span className="text-emerald-300">carregado</span>
                  )}
                </p>
                <p>
                  <span className="font-medium text-slate-100">Sessão:</span>{' '}
                  {sessionError ? (
                    <span className="text-red-300">{sessionError}</span>
                  ) : (
                    <span className="text-emerald-300">ativa</span>
                  )}
                </p>
              </div>
              <p className="mt-4 text-xs text-slate-400">
                Para depurar, verifique o log do servidor (`/api/chatkit/session`) e confirme que as variáveis{' '}
                <code className="rounded-md bg-slate-800 px-2 py-1">OPENAI_API_KEY</code> e{' '}
                <code className="rounded-md bg-slate-800 px-2 py-1">CHATKIT_WORKFLOW_ID</code> estão configuradas.
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default DematecMeliPage;
