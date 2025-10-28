import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

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

const INTERVAL_OPTIONS = ['5m', '15m', '30m', '60m'] as const;
type IntervalOption = (typeof INTERVAL_OPTIONS)[number];

const STATUS_OPTIONS = [
  'PENDENTE',
  'DRAFT_PENDENTE',
  'PROCESSANDO_INTEGRACAO',
  'ERRO_PREFEITURA',
  'ERRO_SAP',
  'ENVIADO_SAP',
  'ERRO_PROCESSAMENTO',
] as const;

type StatusOption = (typeof STATUS_OPTIONS)[number];

const SORT_OPTIONS = ['date', 'draft', 'status'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const extractTagValue = (xml: string | undefined, tagName: string): string | null => {
  if (!xml) return null;
  const regex = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, 'i');
  const match = xml.match(regex);
  if (!match || match.length < 2) return null;
  return match[1].replace(/\s+/g, ' ').trim();
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

type ParsedResponse = {
  items: FaturamentoItem[];
  pageNumber: number;
  totalPages: number;
};

const parseApiResponse = (payload: unknown): ParsedResponse => {
  const items: FaturamentoItem[] = [];
  let pageNumber = 0;
  let totalPages = 1;

  const pushItem = (candidate: unknown) => {
    if (candidate && typeof candidate === 'object' && 'id' in candidate) {
      items.push(candidate as FaturamentoItem);
    }
  };

  const parseEnvelope = (envelope: unknown) => {
    if (!envelope || typeof envelope !== 'object') return;
    const castEnvelope = envelope as {
      content?: unknown[];
      totalPages?: number;
      number?: number;
      pageable?: { pageNumber?: number };
    };

    if (Array.isArray(castEnvelope.content)) {
      castEnvelope.content.forEach(pushItem);
    }

    if (typeof castEnvelope.totalPages === 'number') {
      totalPages = Math.max(1, castEnvelope.totalPages);
    }

    if (typeof castEnvelope.number === 'number') {
      pageNumber = castEnvelope.number;
    } else if (
      castEnvelope.pageable &&
      typeof castEnvelope.pageable === 'object' &&
      typeof castEnvelope.pageable.pageNumber === 'number'
    ) {
      pageNumber = castEnvelope.pageable.pageNumber;
    }
  };

  if (Array.isArray(payload)) {
    const hasEnvelope = payload.some(
      (entry) => entry && typeof entry === 'object' && Array.isArray((entry as { content?: unknown[] }).content)
    );

    if (hasEnvelope) {
      payload.forEach(parseEnvelope);
    } else {
      payload.forEach(pushItem);
    }
  } else {
    parseEnvelope(payload);
  }

  return {
    items,
    pageNumber,
    totalPages: Math.max(1, totalPages),
  };
};

const statusBadgeClassName = (status: string): string => {
  const base = 'inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold uppercase';

  if (status.startsWith('ERRO')) {
    return `${base} border border-[#ff4d4f33] bg-[#ff4d4f1a] text-[#ff9a9b]`;
  }

  switch (status as StatusOption) {
    case 'PENDENTE':
      return `${base} border border-[#f0b42933] bg-[#f0b4291a] text-[#f6d17b]`;
    case 'ENVIADO_SAP':
      return `${base} border border-[#4CAF5040] bg-[#4CAF501a] text-[#7ddf85]`;
    case 'PROCESSANDO_INTEGRACAO':
      return `${base} border border-[#2196F340] bg-[#2196F31a] text-[#6ec3ff]`;
    case 'DRAFT_PENDENTE':
      return `${base} border border-[#9E9E9E3d] bg-[#9E9E9E26] text-[#e0e0e0]`;
    default:
      return `${base} border border-slate-600 bg-slate-800/60 text-slate-200`;
  }
};

const TEMP_USERS = [
  { username: 'porto.ti', password: 'tIPorto@2026' },
  { username: 'admin.ti', password: 'admtIPorto@2026' },
] as const;

const FaturamentosPage: React.FC = () => {
  const [items, setItems] = useState<FaturamentoItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [intervalFilter, setIntervalFilter] = useState<IntervalOption>('15m');
  const [statusFilter, setStatusFilter] = useState<StatusOption | ''>('');
  const [draftFilter, setDraftFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [credentials, setCredentials] = useState({ username: '', password: '' });

  const hasFetchedInitially = useRef(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [activeInterval, setActiveInterval] = useState<IntervalOption>('15m');
  const [activeStatus, setActiveStatus] = useState<StatusOption | ''>('');

  const fetchData = useCallback(
    async (override?: {
      interval?: IntervalOption;
      status?: StatusOption | '';
      page?: number;
      reset?: boolean;
    }) => {
      const page = override?.page ?? 0;
      const reset = override?.reset ?? page === 0;
      const intervalValue = override?.interval ?? activeInterval;
      const statusValue = override?.status ?? activeStatus;

      if (!isAuthenticated) {
        return;
      }

      if (reset) {
        setItems([]);
        setLoadedPages([]);
        setTotalPages(1);
      }

      setIsLoading(true);
      setError(null);

      try {
        const url = new URL(WEBHOOK_URL);
        url.searchParams.set('interval', intervalValue);
        url.searchParams.set('page', String(page));
        if (statusValue) {
          url.searchParams.set('status', statusValue);
        }

        const response = await fetch(url.toString(), {
          headers: {
            Accept: 'application/json',
          },
        });

        if (!response.ok) {
          throw new Error(`Falha ao consultar webhook (status ${response.status})`);
        }

        const data = await response.json();
        const parsed = parseApiResponse(data);

        setItems((prev) => {
          const base = reset ? [] : prev;
          const map = new Map(base.map((item) => [item.id, item]));
          parsed.items.forEach((item) => map.set(item.id, item));
          return Array.from(map.values());
        });

        setTotalPages(parsed.totalPages);
        setLoadedPages((prev) => {
          const base = reset ? [] : prev;
          const next = new Set<number>(base);
          next.add(typeof parsed.pageNumber === 'number' ? parsed.pageNumber : page);
          next.add(page);
          return Array.from(next).sort((a, b) => a - b);
        });

        if (reset || page === 0) {
          setLastUpdated(new Date());
          setActiveInterval(intervalValue);
          setActiveStatus(statusValue);
        }
      } catch (err) {
        console.error('[FaturamentosPage] Erro ao carregar dados', err);
        const message = err instanceof Error ? err.message : 'Não foi possível carregar os faturamentos.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [activeInterval, activeStatus, isAuthenticated]
  );

  useEffect(() => {
    if (!isAuthenticated) {
      hasFetchedInitially.current = false;
      return;
    }

    if (hasFetchedInitially.current) {
      return;
    }

    hasFetchedInitially.current = true;
    fetchData({ interval: '15m', status: '', reset: true, page: 0 });
  }, [fetchData, isAuthenticated]);

  const filteredItems = useMemo(() => {
    const query = draftFilter.trim();
    if (!query) {
      return items;
    }

    return items.filter((item) => {
      const draftString = String(item.draft);
      return draftString.includes(query);
    });
  }, [draftFilter, items]);

  const sortedItems = useMemo(() => {
    const clone = [...filteredItems];
    switch (sortOption) {
      case 'draft':
        return clone.sort((a, b) => Number(a.draft) - Number(b.draft));
      case 'status':
        return clone.sort((a, b) => a.status.localeCompare(b.status));
      case 'date':
      default:
        return clone.sort((a, b) => {
          const dateA = new Date(a.alteradoEm ?? a.criadoEm ?? 0).getTime();
          const dateB = new Date(b.alteradoEm ?? b.criadoEm ?? 0).getTime();
          return dateB - dateA;
        });
    }
  }, [filteredItems, sortOption]);

  const summary = useMemo(() => {
    if (!filteredItems.length) {
      return {
        totalProcessos: 0,
        ultimaEmissao: null as string | null,
        emitidas: 0,
        statusUnicos: 0,
      };
    }

    let ultimaEmissao: Date | null = null;
    let emitidas = 0;
    const statusSet = new Set<string>();

    filteredItems.forEach((item) => {
      statusSet.add(item.status);

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
      totalProcessos: filteredItems.length,
      ultimaEmissao: ultimaEmissao ? formatDateTime(ultimaEmissao.toISOString()) : null,
      emitidas,
      statusUnicos: statusSet.size,
    };
  }, [filteredItems]);

  const handleIntervalChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setIntervalFilter(event.target.value as IntervalOption);
  };

  const handleStatusChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setStatusFilter(event.target.value as StatusOption | '');
  };

  const handleDraftChange = (event: ChangeEvent<HTMLInputElement>) => {
    setDraftFilter(event.target.value.replace(/\D/g, ''));
  };

  const handleSortChange = (event: ChangeEvent<HTMLSelectElement>) => {
    setSortOption(event.target.value as SortOption);
  };

  const handleAuthFieldChange = (event: ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setCredentials((prev) => ({ ...prev, [name]: value }));
  };

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading) return;

    setAuthError(null);
    setAuthLoading(true);

    const isValid = TEMP_USERS.some(
      (user) => user.username === credentials.username && user.password === credentials.password
    );

    if (isValid) {
      setIsAuthenticated(true);
      setAuthLoading(false);
      setCredentials({ username: '', password: '' });
    } else {
      setAuthError('Credenciais inválidas. Tente novamente.');
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!draftFilter.trim()) return;
    if (filteredItems.length > 0) return;
    if (isLoading) return;
    if (loadedPages.length >= totalPages) return;

    const nextPage = (() => {
      for (let i = 0; i < totalPages; i += 1) {
        if (!loadedPages.includes(i)) {
          return i;
        }
      }
      return null;
    })();

    if (nextPage !== null) {
      fetchData({ page: nextPage, reset: false });
    }
  }, [draftFilter, filteredItems.length, isLoading, loadedPages, totalPages, fetchData, isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-10 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex flex-col items-center gap-4">
              <img
                src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
                alt="Porto Itapoá"
                className="h-12 object-contain"
              />
              <h1 className="text-2xl font-semibold text-white">Monitor - NFSe Porto Itapoá</h1>
              <p className="text-center text-sm text-slate-400">
                Acesso restrito a usuários autorizados. Utilize as credenciais temporárias fornecidas.
              </p>
            </div>

            <form className="mt-8 space-y-5" onSubmit={handleAuthSubmit}>
              <div className="space-y-2">
                <label htmlFor="username" className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Usuário
                </label>
                <input
                  id="username"
                  name="username"
                  autoComplete="username"
                  value={credentials.username}
                  onChange={handleAuthFieldChange}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Digite o usuário"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Senha
                </label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  value={credentials.password}
                  onChange={handleAuthFieldChange}
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Digite a senha"
                />
              </div>

              {authError && (
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authLoading}
                className="w-full rounded-full bg-indigo-500 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
              >
                {authLoading ? 'Autenticando...' : 'Entrar'}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-slate-800/80 bg-gradient-to-r from-slate-950 via-slate-900/95 to-slate-950 shadow-[0_12px_28px_rgba(8,15,40,0.6)] backdrop-blur-sm">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-6 py-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:gap-6">
              <img
                src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
                alt="Porto Itapoá"
                className="h-10 w-auto object-contain md:h-12"
              />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.3em] text-indigo-400/80">
                  Painel de Faturamentos
                </p>
                <h1 className="mt-2 text-3xl font-bold text-white">Monitor - NFSe Porto Itapoá</h1>
                <p className="mt-1 text-sm text-slate-400">
                  Consulta dos processos de faturamento recebidos do SAP e integrações Prefeitura.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                Intervalo
                <div className="relative">
                  <select
                    value={intervalFilter}
                    onChange={handleIntervalChange}
                    className="w-40 appearance-none rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 pr-10 text-sm font-medium text-slate-100 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  >
                    {INTERVAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                    ▾
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                Status
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={handleStatusChange}
                    className="w-56 appearance-none rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 pr-10 text-sm font-medium text-slate-100 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  >
                    <option value="">--</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                    ▾
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                Draft
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Ex.: 6841"
                    value={draftFilter}
                    onChange={handleDraftChange}
                    className="w-40 rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 text-sm font-medium text-slate-100 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                    #
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.2em] text-slate-400">
                Ordenar por
                <div className="relative">
                  <select
                    value={sortOption}
                    onChange={handleSortChange}
                    className="w-48 appearance-none rounded-full border border-slate-700/70 bg-slate-900/70 px-4 py-2 pr-10 text-sm font-medium text-slate-100 transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  >
                    <option value="date">Data (mais recentes)</option>
                    <option value="draft">Draft (crescente)</option>
                    <option value="status">Status (A-Z)</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">
                    ▾
                  </span>
                </div>
              </label>
            </div>

            <button
              type="button"
              onClick={() => fetchData({ interval: intervalFilter, status: statusFilter, reset: true, page: 0 })}
              disabled={isLoading}
              className="inline-flex items-center justify-center rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600"
            >
              {isLoading ? 'Atualizando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-10 md:px-6">
        <section className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Processos</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.totalProcessos}</p>
            <p className="mt-1 text-xs text-slate-500">Total retornado pelo webhook</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Status distintos</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.statusUnicos}</p>
            <p className="mt-1 text-xs text-slate-500">Quantidade de status encontrados</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-lg shadow-black/20 backdrop-blur">
            <p className="text-xs uppercase tracking-widest text-slate-400">Notas emitidas</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.emitidas}</p>
            <p className="mt-1 text-xs text-slate-500">Com `data_nfse` disponível</p>
          </div>
          <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-5 shadow-lg shadow-black/20 backdrop-blur">
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
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-8 text-center text-sm text-slate-400">
              Carregando processos de faturamento...
            </div>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-8 text-center text-sm text-slate-400">
              Nenhum processo localizado no webhook para os filtros selecionados.
            </div>
          )}

          {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/55 p-8 text-center text-sm text-slate-400">
              Nenhum processo corresponde ao draft informado.
            </div>
          )}

          <div className="mt-6 space-y-6">
            {sortedItems.map((item) => {
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
                  className="rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 shadow-2xl shadow-black/40 transition hover:border-indigo-500/40 hover:shadow-indigo-500/10"
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
                      <span className={statusBadgeClassName(item.status)}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      {numeroNf && (
                        <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-emerald-200">
                          NFSe {numeroNf}
                        </span>
                      )}
                      <span className="text-xs text-slate-500">
                        Atualizado {formatDateTime(item.alteradoEm)} · Criado {formatDateTime(item.criadoEm)}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Tipo</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{item.tipo}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Data emissão</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{composedData}</dd>
                    </div>
                    <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                      <dt className="text-xs uppercase tracking-widest text-slate-400">Tentativas</dt>
                      <dd className="mt-1 text-lg font-medium text-slate-100">{item.nrTentativas ?? 0}</dd>
                    </div>
                  </dl>

                  <details className="group mt-6">
                    <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/55 px-4 py-3 text-sm text-slate-300 transition hover:border-indigo-400 hover:text-white">
                      <span>Ver XML bruto</span>
                      <span className="text-xs uppercase tracking-widest text-indigo-300 transition group-open:rotate-180">
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
