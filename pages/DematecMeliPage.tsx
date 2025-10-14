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
    <div className="flex min-h-screen flex-col bg-[#05060a] text-slate-100">
      <header className="border-b border-slate-900/60 bg-[#070a12]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-5 py-6 md:flex-row md:items-center md:justify-between lg:px-12">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">Central Dematec · Mercado Livre</h1>
            <p className="text-sm text-slate-400 md:text-base">
              Acompanhe pedidos, responda clientes e acione automações do Agent Builder em tempo real.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 rounded-full border border-slate-700 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-indigo-400 hover:text-white"
            >
              ← Voltar para notificações
            </Link>
            <a
              href="https://platform.openai.com/docs/guides/chatkit"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-600"
            >
              Documentação ChatKit
            </a>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-5 py-6 lg:flex-row lg:items-start lg:px-12 xl:gap-8">
          <section className="w-full lg:flex-[0_0_60%] xl:flex-[0_0_65%]">
            <div className="overflow-hidden rounded-3xl border border-slate-900 bg-[#090d17]/80 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.45)] backdrop-blur">
              <div className="border-b border-slate-800/80 px-6 py-5">
                <h2 className="text-lg font-semibold text-white md:text-xl">Assistente Dematec · Mercado Livre</h2>
                <p className="text-xs text-slate-400 md:text-sm">
                  Conectado ao workflow publicado no Agent Builder. Utilize prompts iniciais ou defina uma estratégia própria.
                </p>
              </div>
              <div className="relative px-3 pb-6 pt-5 sm:px-4 lg:px-5">
                {!isWidgetReady && (
                  <div className="absolute inset-4 rounded-2xl border border-dashed border-slate-700/80 bg-slate-900/40 p-6 text-sm text-slate-300">
                    <p className="font-medium text-slate-200">Carregando ChatKit…</p>
                    <p className="mt-2 text-slate-400">
                      Estamos baixando o widget do CDN da OpenAI. Verifique sua conexão caso esta mensagem persista.
                    </p>
                    {scriptError && (
                      <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{scriptError}</p>
                    )}
                  </div>
                )}
                {isWidgetReady && (
                  <div className="mx-auto h-[70vh] w-full max-w-[1040px] rounded-2xl border border-slate-800/80 bg-[#0b101d] shadow-inner shadow-black/40 sm:h-[68vh] md:h-[72vh] lg:h-[75vh]">
                    <ChatKit control={chatkit.control} className="block h-full w-full rounded-2xl" />
                  </div>
                )}
              </div>
            </div>
          </section>

          <aside className="w-full lg:flex-[0_0_40%] xl:flex-[0_0_35%]">
            <div className="grid gap-6 xl:gap-8">
              <div className="rounded-3xl border border-slate-900 bg-[#090d17]/80 p-6 shadow-[0_20px_45px_-20px_rgba(15,23,42,0.7)] backdrop-blur">
                <h3 className="text-lg font-semibold text-white md:text-xl">Como funciona este painel</h3>
                <ul className="mt-4 space-y-3 text-sm text-slate-300 md:text-base">
                  <li>
                    <span className="font-medium text-slate-100">Workflow:</span> usa o ID publicado configurado nas variáveis{' '}
                    <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">CHATKIT_WORKFLOW_ID</code> e{' '}
                    <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">VITE_CHATKIT_WORKFLOW_ID</code> para iniciar sessões.
                  </li>
                  <li>
                    <span className="font-medium text-slate-100">Autenticação:</span> o backend gera um{' '}
                    <code className="rounded-md bg-slate-800 px-2 py-1 text-xs font-mono">client_secret</code> efêmero via OpenAI API a cada acesso.
                  </li>
                  <li>
                    <span className="font-medium text-slate-100">Ferramentas:</span> `Search docs` procura tutoriais internos; `Sincronizar pedidos`
                    dispara nossa integração Mercado Livre → Agent Builder.
                  </li>
                  <li>
                    <span className="font-medium text-slate-100">Start screen:</span> prompts sugeridos aceleram briefing de pedidos, logística e insights de SLA.
                  </li>
                </ul>
              </div>

              <div className="rounded-3xl border border-slate-900 bg-[#090d17]/80 p-6 shadow-[0_20px_45px_-20px_rgba(15,23,42,0.7)] backdrop-blur">
                <h3 className="text-lg font-semibold text-white md:text-xl">Erros e diagnósticos</h3>
                <div className="mt-4 space-y-3 text-sm text-slate-300 md:text-base">
                  <div>
                    <span className="font-medium text-slate-100">Widget:</span>{' '}
                    {scriptError ? <span className="text-red-300">{scriptError}</span> : <span className="text-emerald-300">carregado</span>}
                  </div>
                  <div>
                    <span className="font-medium text-slate-100">Sessão:</span>{' '}
                    {sessionError ? <span className="text-red-300">{sessionError}</span> : <span className="text-emerald-300">ativa</span>}
                  </div>
                </div>
                <p className="mt-5 text-xs text-slate-500 md:text-sm">
                  Para depurar, verifique o log do servidor (`/api/chatkit/session`) e confirme que as variáveis{' '}
                  <code className="rounded-md bg-slate-800 px-2 py-1">OPENAI_API_KEY</code> e{' '}
                  <code className="rounded-md bg-slate-800 px-2 py-1">CHATKIT_WORKFLOW_ID</code> estão configuradas.
                </p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
};

export default DematecMeliPage;
