import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type FaturamentoItem = {
  id: string;
  draft: number;
  tipo: string;
  status: string;
  xml: string;
  xmlRetorno?: string;
  criadoEm?: string;
  alteradoEm?: string;
  novoModelo?: boolean;
  nrTentativas?: number;
};

const WEBHOOK_URL = 'https://n8n.autevia.com.br/webhook/fats';

const extractTagValue = (xml: string | undefined, tagName: string): string | null => {
  if (!xml) return null;
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match || match.length < 2) return null;
  return match[1].replace(/\s+/g, ' ').trim();
};

const parseCurrency = (input: string | null): number | null => {
  if (!input) return null;
  const sanitized = input.replace(/\./g, '').replace(',', '.');
  const value = Number.parseFloat(sanitized);
  return Number.isFinite(value) ? value : null;
};

const formatCurrency = (value: number | null): string => {
  if (value === null || Number.isNaN(value)) return '—';
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatDateTime = (iso?: string, fallback?: string): string => {
  if (!iso) return fallback ?? '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return fallback ?? iso;
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
};

const normalizePayload = (payload: unknown): FaturamentoItem[] => {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.flatMap((entry) =>
      entry && typeof entry === 'object' && Array.isArray((entry as { content?: unknown[] }).content)
        ? ((entry as { content: unknown[] }).content.filter(
            (item): item is FaturamentoItem => item !== null && typeof item === 'object'
          ) as FaturamentoItem[])
        : []
    );
  }

  if (typeof payload === 'object' && Array.isArray((payload as { content?: unknown[] }).content)) {
    return (payload as { content: unknown[] }).content.filter(
      (item): item is FaturamentoItem => item !== null && typeof item === 'object'
    ) as FaturamentoItem[];
  }

  return [];
};

const statusBadgeStyles: Record<string, string> = {
  ENVIADO_SAP: 'bg-purple-500/20 text-purple-100 border border-purple-400/40',
  ERRO: 'bg-red-500/20 text-red-100 border border-red-400/40',
  PROCESSADO: 'bg-emerald-500/20 text-emerald-100 border border-emerald-400/40',
};

const FaturamentosPage: React.FC = () => {
  const [items, setItems] = useState<FaturamentoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(WEBHOOK_URL, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Falha ao consultar webhook (status ${response.status})`);
      }

      const data = await response.json();
      const normalized = normalizePayload(data);
      setItems(normalized);
      setLastUpdated(new Date());
    } catch (err) {
      console.error('[FaturamentosPage] Erro ao carregar dados', err);
      const message = err instanceof Error ? err.message : 'Não foi possível carregar os faturamentos.';
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const summary = useMemo(() => {
    if (!items.length) {
      return {
        totalValor: null as number | null,
        totalProcessos: 0,
        ultimaEmissao: null as string | null,
        emitidas: 0,
      };
    }

    let totalValorAccumulator = 0;
    let ultimaEmissao: Date | null = null;
    let emitidas = 0;

    items.forEach((item) => {
      const valor =
        parseCurrency(extractTagValue(item.xmlRetorno, 'valor_total')) ??
        parseCurrency(extractTagValue(item.xml, 'valor_total'));

      if (valor !== null) {
        totalValorAccumulator += valor;
      }

      const dataNf = extractTagValue(item.xmlRetorno, 'data_nfse');
      const horaNf = extractTagValue(item.xmlRetorno, 'hora_nfse');

      if (dataNf) {
        const [dia, mes, ano] = dataNf.split('/');
        const composed = `${ano}-${mes}-${dia}T${horaNf ?? '00:00:00'}`;
        const date = new Date(composed);
        if (!Number.isNaN(date.getTime())) {
          if (!ultimaEmissao || date > ultimaEmissao) {
            ultimaEmissao = date;
          }
          emitidas += 1;
        }
      }
    });

    return {
      totalValor: totalValorAccumulator || null,
      totalProcessos: items.length,
      ultimaEmissao: ultimaEmissao ? formatDateTime(ultimaEmissao.toISOString()) : null,
      emitidas,
    };
  }, [items]);

  const renderStatusBadge = (status: string) => {
    const base = 'inline-flex px-3 py-1 rounded-full text-xs font-semibold tracking-wide uppercase';
    const extra = statusBadgeStyles[status] ?? 'bg-slate-500/20 text-slate-100 border border-slate-400/40';
    return <span className={`${base} ${extra}`}>{status.replace(/_/g, ' ')}</span>;
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-6 py-6 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400/80">
              Painel de Faturamentos
            </p>
            <h1 className="mt-2 text-3xl font-bold text-white">Monitor n8n · NFSe</h1>
            <p className="mt-1 text-sm text-slate-400">
              Consulta o webhook `fats` e apresenta os processos de faturamento recebidos via n8n.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full border border-slate-700 px-4 py-2 text-sm font-medium text-slate-200 transition hover:border-indigo-400 hover:text-white"
            >
              Página inicial
            </Link>
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {isLoading ? 'Atualizando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 md:px-6">
        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Processos</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.totalProcessos}</p>
            <p className="mt-1 text-xs text-slate-500">Total retornado pelo webhook</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Valor agregado</p>
            <p className="mt-2 text-3xl font-semibold text-white">{formatCurrency(summary.totalValor)}</p>
            <p className="mt-1 text-xs text-slate-500">Soma dos valores encontrados</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Notas emitidas</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.emitidas}</p>
            <p className="mt-1 text-xs text-slate-500">Com `data_nfse` disponível</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5 shadow-lg shadow-black/10 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Última atualização</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : '—'}
            </p>
            <p className="mt-1 text-xs text-slate-500">Horário da última consulta manual</p>
          </div>
        </section>

        <section className="mt-10">
          {error && (
            <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-6 text-sm text-red-200">
              {error}
            </div>
          )}

          {!error && isLoading && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              Carregando processos de faturamento...
            </div>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center text-sm text-slate-400">
              Nenhum processo localizado no webhook.
            </div>
          )}

          <div className="mt-6 space-y-6">
            {items.map((item) => {
              const valorBruto =
                parseCurrency(extractTagValue(item.xmlRetorno, 'valor_total')) ??
                parseCurrency(extractTagValue(item.xml, 'valor_total'));
              const cliente =
                extractTagValue(item.xmlRetorno, 'nome_razao_social') ??
                extractTagValue(item.xml, 'nome_razao_social');
              const numeroNf = extractTagValue(item.xmlRetorno, 'numero_nfse');
              const dataNf = extractTagValue(item.xmlRetorno, 'data_nfse');
              const horaNf = extractTagValue(item.xmlRetorno, 'hora_nfse');
              const observacao =
                extractTagValue(item.xmlRetorno, 'observacao') ?? extractTagValue(item.xml, 'observacao');

              const composedData =
                dataNf && horaNf
                  ? `${dataNf} · ${horaNf}`
                  : dataNf ?? formatDateTime(item.alteradoEm, '—');

              return (
                <article
                  key={item.id}
                  className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/30"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.28em] text-indigo-400/70">
                        Draft {item.draft}
                      </p>
                      <h2 className="mt-1 text-2xl font-semibold text-white">
                        {cliente ?? 'Cliente não identificado'}
                      </h2>
                      <p className="mt-1 text-sm text-slate-400">
                        {observacao ?? 'Sem observações registradas.'}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      {renderStatusBadge(item.status)}
                      {numeroNf && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-200">
                          NFSe {numeroNf}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Atualizado {formatDateTime(item.alteradoEm)} · Criado {formatDateTime(item.criadoEm)}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Tipo</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{item.tipo}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Valor total</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{formatCurrency(valorBruto)}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Data emissão</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{composedData}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Tentativas</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{item.nrTentativas ?? 0}</dd>
                    </div>
                  </dl>

                  <details className="group mt-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/50 px-4 py-3 text-sm text-slate-300 transition hover:border-indigo-400 hover:text-white">
                      <span>Ver XML bruto</span>
                      <span className="text-xs uppercase tracking-widest text-indigo-300 group-open:rotate-180 transition">
                        Expandir
                      </span>
                    </summary>
                    <div className="mt-3 grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800 bg-black/60 p-4">
                        <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                          Payload enviado
                        </p>
                        <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-slate-200">
                          {item.xml}
                        </pre>
                      </div>
                      {item.xmlRetorno && (
                        <div className="rounded-2xl border border-slate-800 bg-black/60 p-4">
                          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-slate-400">
                            Retorno prefeitura
                          </p>
                          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs text-emerald-200">
                            {item.xmlRetorno}
                          </pre>
                        </div>
                      )}
                    </div>
                  </details>
                </article>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default FaturamentosPage;
