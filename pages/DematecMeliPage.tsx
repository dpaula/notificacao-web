import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
            icon: 'clipboard',
            label: 'Pedidos do dia',
            prompt: 'Busque todos pedidos de hoje',
          },
          {
            icon: 'check-circle',
            label: 'Prontos para envio',
            prompt: 'Liste todos os pedidos prontos para envio',
          },
          {
            icon: 'clock',
            label: 'Últimos 3 dias',
            prompt: 'Traga apenas as prontas para envio dos últimos 3 dias, no máximo 40 resultados',
          },
        ],
      },
    }),
    [getClientSecret]
  );

  const chatkit = useChatKit(chatKitOptions);

  return (
    <div className="flex min-h-screen flex-col items-center bg-[#05060a] text-slate-100">
      <header className="w-full border-b border-slate-900/40 bg-[#070a12]">
        <div className="mx-auto flex w-full max-w-4xl flex-col items-start gap-2 px-5 py-8 text-left sm:items-center sm:text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-white sm:text-3xl">Central Dematec · Mercado Livre</h1>
          <p className="text-sm text-slate-400 sm:text-base">
            Interface dedicada para consultar e orquestrar pedidos Mercado Livre via Agent Builder.
          </p>
        </div>
      </header>

      <main className="flex w-full flex-1 justify-center px-4 py-8 sm:px-6 md:px-8">
        <div className="flex w-full max-w-4xl flex-col">
          <section className="relative overflow-hidden rounded-[28px] bg-[#0b0d16] shadow-[0_18px_40px_-20px_rgba(15,23,42,0.9)]">
            {!isWidgetReady && (
              <div className="absolute inset-5 rounded-[24px] border border-dashed border-slate-800/50 bg-[#0d111f]/80 p-6 text-sm text-slate-300">
                <p className="font-medium text-slate-200">Carregando ChatKit…</p>
                <p className="mt-2 text-slate-500">
                  Estamos baixando o widget do CDN da OpenAI. Verifique sua conexão caso esta mensagem persista.
                </p>
                {scriptError && (
                  <p className="mt-4 rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-300">{scriptError}</p>
                )}
              </div>
            )}

            <div className="mx-auto h-[72vh] w-full max-w-[920px] px-3 pb-6 pt-6 sm:h-[74vh] sm:px-5 md:h-[78vh] lg:h-[80vh]">
              {isWidgetReady && (
                <div className="h-full w-full rounded-[22px] bg-[#0d111f]">
                  <ChatKit control={chatkit.control} className="block h-full w-full rounded-[22px]" />
                </div>
              )}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default DematecMeliPage;
