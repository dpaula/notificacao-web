import React, {
  ChangeEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import './animations.css';

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
  resumo?: FaturamentoResumo;
};

type FaturamentoResumo = {
  id: string;
  draft: number;
  tipo: string;
  status: string;
  statusErp?: string;
  cnpjCliente?: string;
  nomeCliente?: string;
  valorTotal?: number;
  nfseNumero?: number;
  nfseSerie?: string;
  nfseArquivoGerador?: string;
  nfseCodVerificadorAutenticidade?: string;
  nfseLink?: string;
  urlFinalPdfNFSe?: string;
  nfseDataEmissao?: string;
  dataVencimento?: string;
  urlPdfNf?: string | null;
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
type StatusTotalOption = StatusOption;

const STATUS_TOTALS = STATUS_OPTIONS;

type StatusConfig = {
  alertThreshold: number;
  startFrom: number;
};

type StatusConfigMap = Record<StatusTotalOption, StatusConfig>;

const SORT_OPTIONS = ['date', 'draft', 'status'] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const GearIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09A1.65 1.65 0 0 0 9 3.09V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
);

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

const formatCurrencyBRL = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 }).format(
    value
  );
};

const formatInt = (value?: number | null): string => {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 }).format(value);
};

type StatusTotalsMap = Record<StatusTotalOption, number | null>;

const STATUS_CONFIG_STORAGE_KEY = 'porto_nfse_status_config';
const TOTALS_REFRESH_STORAGE_KEY = 'porto_nfse_totals_refresh';

const defaultStatusConfig = (status: StatusTotalOption): StatusConfig => {
  if (['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) {
    return { alertThreshold: 0, startFrom: 0 };
  }
  if (['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'].includes(status)) {
    return { alertThreshold: 20, startFrom: 0 };
  }
  return { alertThreshold: 0, startFrom: 0 };
};

const buildDefaultStatusConfigMap = (): StatusConfigMap =>
  STATUS_TOTALS.reduce<StatusConfigMap>((acc, status) => {
    acc[status] = defaultStatusConfig(status);
    return acc;
  }, {} as StatusConfigMap);

const clampRefreshSeconds = (value: number): number => {
  if (Number.isNaN(value)) return 30;
  return Math.min(120, Math.max(5, value));
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

const totalStatusClasses = (
  status: StatusTotalOption,
  adjustedValue: number | null,
  config: StatusConfig,
  animating: boolean
): string => {
  const base =
    'relative overflow-hidden rounded-2xl border p-5 shadow-lg shadow-black/15 backdrop-blur flex flex-col items-center gap-2 justify-center min-h-[130px] transition text-center';
  const safeValue = typeof adjustedValue === 'number' ? adjustedValue : 0;

  const warnStatuses: StatusTotalOption[] = ['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'];
  const errorStatuses: StatusTotalOption[] = ['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'];

  const isAlert = safeValue > config.alertThreshold;
  const loadingClasses = animating ? 'animate-pulse-soft totals-card-sheen' : '';

  if (isAlert && errorStatuses.includes(status)) {
    return `${base} ${loadingClasses} border-red-500/50 bg-red-500/12 text-red-50 hover:border-red-400/70`;
  }

  if (isAlert && warnStatuses.includes(status)) {
    return `${base} ${loadingClasses} border-amber-400/45 bg-amber-400/12 text-amber-50 hover:border-amber-300/70`;
  }

  // Within safe range -> verde
  return `${base} ${loadingClasses} border-emerald-500/45 bg-emerald-500/12 text-emerald-50 hover:border-emerald-300/70`;
};

const subtitleByStatus = (status: StatusTotalOption, config: StatusConfig): string => {
  if (status === 'ENVIADO_SAP') return 'Fluxos concluídos';
  if (['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) {
    return `Alerta total > ${config.alertThreshold}`;
  }
  return `Alerta > ${config.alertThreshold}`;
};

const subtitleColor = (status: StatusTotalOption, isAlert: boolean): string => {
  if (status === 'ENVIADO_SAP') return 'text-emerald-100/90';
  if (isAlert && ['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) return 'text-red-100/90';
  if (isAlert) return 'text-amber-100/90';
  return 'text-emerald-100/90';
};

const computeDisplayTotal = (value: number | null, config: StatusConfig): number | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(0, value - (config.startFrom ?? 0));
};

const TEMP_USERS = [
  { username: 'porto.ti', password: 'tIPorto@2026' },
  { username: 'admin.ti', password: 'admtIPorto@2026' },
] as const;

const AUTH_STORAGE_KEY = 'porto_nfse_auth';
const AUTH_PREF_KEY = 'porto_nfse_remember';
const AUTH_EXPIRATION_MS = 1000 * 60 * 60 * 24 * 7; // 7 dias

type XmlTreeNode = {
  name: string;
  value?: string;
  attributes: Record<string, string>;
  children: XmlTreeNode[];
};

const parseXmlToTree = (xml: string): XmlTreeNode | null => {
  if (typeof window === 'undefined') return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xml, 'application/xml');
    if (doc.getElementsByTagName('parsererror').length > 0) {
      return null;
    }
    const root = doc.documentElement;
    const transform = (el: Element): XmlTreeNode => {
      const attributes = Array.from(el.attributes).reduce<Record<string, string>>((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {});

      const elementChildren = Array.from(el.children) as Element[];
      const textNodes = Array.from(el.childNodes).filter(
        (node) => node.nodeType === Node.TEXT_NODE && (node.textContent || '').trim().length > 0
      );
      const value =
        elementChildren.length === 0
          ? textNodes
              .map((node) => (node.textContent || '').trim())
              .filter(Boolean)
              .join(' ')
              .replace(/\s+/g, ' ') || undefined
          : undefined;

      return {
        name: el.tagName,
        value,
        attributes,
        children: elementChildren.map(transform),
      };
    };

    return transform(root);
  } catch (error) {
    console.error('[FaturamentosPage] Falha ao analisar XML', error);
    return null;
  }
};

const SchemaNodeRow: React.FC<{ node: XmlTreeNode; depth?: number }> = ({ node, depth = 0 }) => {
  const hasChildren = node.children.length > 0;
  const hasAttributes = Object.keys(node.attributes).length > 0;
  const summaryValue = node.value && node.value.length > 80 ? `${node.value.slice(0, 77)}…` : node.value;

  return (
    <div style={{ marginLeft: depth * 18 }} className="space-y-2">
      <details
        open={depth < 2}
        className="group rounded-xl border border-slate-800/70 bg-slate-900/80 text-slate-200 shadow-inner shadow-black/20"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm transition hover:bg-slate-900/80">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800/90 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">
              {hasChildren ? '<>' : 'ab'}
            </span>
            <span className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-100">{node.name}</span>
          </span>
          {summaryValue && (
            <span className="truncate text-[11px] text-slate-400">{summaryValue}</span>
          )}
        </summary>
        <div className="space-y-3 border-t border-slate-800/60 px-4 py-3 text-sm">
          {node.value && (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-slate-950/75 px-3 py-2 text-sm text-slate-200">
              {node.value}
            </pre>
          )}

          {hasAttributes && (
            <div className="space-y-2">
              {Object.entries(node.attributes).map(([key, value]) => (
                <div
                  key={key}
                  className="rounded-lg border border-indigo-500/25 bg-indigo-500/10 px-3 py-2 text-xs text-indigo-100"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.35em] text-indigo-300">@ {key}</p>
                  <p className="mt-1 break-words text-indigo-100/90">{value}</p>
                </div>
              ))}
            </div>
          )}

          {hasChildren && (
            <div className="space-y-2">
              {node.children.map((child, idx) => (
                <SchemaNodeRow key={`${node.name}-${idx}`} node={child} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      </details>
    </div>
  );
};

const XmlSchemaView: React.FC<{
  xml?: string | null;
  title: string;
  accent?: 'default' | 'emerald';
  onCopy: () => void;
  copied: boolean;
}> = ({ xml, title, accent = 'default', onCopy, copied }) => {
  const tree = useMemo(() => {
    if (!xml || !xml.trim()) return null;
    return parseXmlToTree(xml);
  }, [xml]);

  const accentClasses =
    accent === 'emerald'
      ? {
          container: 'border-emerald-500/30 bg-emerald-500/5',
          button: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200 hover:border-emerald-400 hover:text-emerald-100',
          badge: 'text-emerald-300',
        }
      : {
          container: 'border-slate-800 bg-black/60',
          button: 'border-slate-700/60 bg-slate-900/70 text-slate-300 hover:border-indigo-400 hover:text-indigo-200',
          badge: 'text-indigo-300',
        };

  if (!xml || !xml.trim()) {
    return (
      <div className={`rounded-2xl border ${accentClasses.container} p-4 text-xs text-slate-500`}>
        Nenhum dado disponível.
      </div>
    );
  }

  return (
    <div className={`rounded-2xl border ${accentClasses.container} p-4 shadow-inner shadow-black/20`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.35em] text-slate-400">{title}</p>
        <button
          type="button"
          onClick={onCopy}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full text-xs transition focus:outline-none focus:ring-2 focus:ring-indigo-400/40 ${accentClasses.button}`}
          aria-label={`Copiar ${title}`}
        >
          <CopyIcon className="h-4 w-4" />
        </button>
      </div>

      {tree ? (
        <div className="max-h-[28rem] overflow-auto rounded-xl border border-slate-800/60 bg-slate-950/70 px-4 py-4">
          <SchemaNodeRow node={tree} />
        </div>
      ) : (
        <pre className="max-h-[28rem] overflow-auto rounded-xl bg-slate-950/70 p-4 text-xs font-mono text-slate-200">
          {xml}
        </pre>
      )}

      {copied && (
        <span className={`mt-3 inline-flex text-[10px] font-semibold uppercase tracking-[0.35em] ${accentClasses.badge}`}>
          Copiado
        </span>
      )}
    </div>
  );
};

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
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rememberDevice, setRememberDevice] = useState<boolean>(true);
  const [totals, setTotals] = useState<StatusTotalsMap>(() =>
    STATUS_TOTALS.reduce((acc, status) => ({ ...acc, [status]: null }), {} as StatusTotalsMap)
  );
  const [totalsLoading, setTotalsLoading] = useState<boolean>(false);
  const [totalsError, setTotalsError] = useState<string | null>(null);
  const [totalsAnimating, setTotalsAnimating] = useState<boolean>(false);
  const totalsAnimationTimeoutRef = useRef<number | null>(null);
  const [statusConfig, setStatusConfig] = useState<StatusConfigMap>(() => {
    if (typeof window === 'undefined') return buildDefaultStatusConfigMap();
    try {
      const stored = window.localStorage.getItem(STATUS_CONFIG_STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Partial<StatusConfigMap>;
        const base = buildDefaultStatusConfigMap();
        STATUS_TOTALS.forEach((status) => {
          const conf = parsed?.[status];
          base[status] = {
            alertThreshold: typeof conf?.alertThreshold === 'number' ? conf.alertThreshold : base[status].alertThreshold,
            startFrom: typeof conf?.startFrom === 'number' ? conf.startFrom : base[status].startFrom,
          };
        });
        return base;
      }
    } catch (err) {
      console.warn('[FaturamentosPage] Falha ao restaurar configurações', err);
    }
    return buildDefaultStatusConfigMap();
  });
  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [sessionValidateLoading, setSessionValidateLoading] = useState(false);
  const [sessionValidateResult, setSessionValidateResult] = useState<
    { valido: boolean; fileId?: string; mensagem?: string } | null
  >(null);
  const [sessionUpdateLoading, setSessionUpdateLoading] = useState(false);
  const [sessionUpdateValue, setSessionUpdateValue] = useState('');
  const [sessionUpdateResult, setSessionUpdateResult] = useState<{ mensagem: string } | null>(null);
  const [autoRefreshEnabled, setAutoRefreshEnabled] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const raw = window.localStorage.getItem(TOTALS_REFRESH_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { enabled?: boolean };
      return Boolean(parsed?.enabled);
    } catch {
      return false;
    }
  });
  const [autoRefreshSeconds, setAutoRefreshSeconds] = useState<number>(() => {
    if (typeof window === 'undefined') return 30;
    try {
      const raw = window.localStorage.getItem(TOTALS_REFRESH_STORAGE_KEY);
      if (!raw) return 30;
      const parsed = JSON.parse(raw) as { seconds?: number };
      return clampRefreshSeconds(parsed?.seconds ?? 30);
    } catch {
      return 30;
    }
  });

  const hasFetchedInitially = useRef(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [activeInterval, setActiveInterval] = useState<IntervalOption>('15m');
  const [activeStatus, setActiveStatus] = useState<StatusOption | ''>('');
  const copyTimeoutRef = useRef<number | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const storedPreference = window.localStorage.getItem(AUTH_PREF_KEY);
      if (storedPreference !== null) {
        setRememberDevice(storedPreference === 'true');
      }

      const persisted = window.localStorage.getItem(AUTH_STORAGE_KEY);
      if (!persisted) {
        return;
      }

      const parsed = JSON.parse(persisted) as { username?: string; expiresAt?: number };
      if (!parsed?.username) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }

      if (parsed.expiresAt && parsed.expiresAt < Date.now()) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
        return;
      }

      if (TEMP_USERS.some((user) => user.username === parsed.username)) {
        setIsAuthenticated(true);
      } else {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch (error) {
      console.warn('[FaturamentosPage] Não foi possível restaurar sessão salva', error);
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STATUS_CONFIG_STORAGE_KEY, JSON.stringify(statusConfig));
  }, [statusConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(
      TOTALS_REFRESH_STORAGE_KEY,
      JSON.stringify({ enabled: autoRefreshEnabled, seconds: autoRefreshSeconds })
    );
  }, [autoRefreshEnabled, autoRefreshSeconds]);

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
        url.searchParams.set('resource', 'lista-resumo');
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

  const fetchTotals = useCallback(async () => {
    if (!isAuthenticated) return;
    setTotalsLoading(true);
    setTotalsAnimating(true);
    if (totalsAnimationTimeoutRef.current) {
      window.clearTimeout(totalsAnimationTimeoutRef.current);
      totalsAnimationTimeoutRef.current = null;
    }
    setTotalsError(null);
    try {
      const entries = await Promise.all(
        STATUS_TOTALS.map(async (status) => {
          const url = new URL(WEBHOOK_URL);
          url.searchParams.set('resource', 'total');
          url.searchParams.set('status', status);
          const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
          if (!response.ok) {
            throw new Error(`Falha ao consultar total (${status})`);
          }
          const data = await response.json();
          const value =
            typeof data === 'number'
              ? data
              : typeof (data as { total?: number }).total === 'number'
              ? (data as { total: number }).total
              : 0;
          return [status, value] as const;
        })
      );
      const nextTotals = entries.reduce<StatusTotalsMap>(
        (acc, [status, value]) => ({ ...acc, [status]: value }),
        STATUS_TOTALS.reduce((acc, status) => ({ ...acc, [status]: null }), {} as StatusTotalsMap)
      );
      setTotals(nextTotals);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha ao carregar totais por status.';
      setTotalsError(message);
    } finally {
      setTotalsLoading(false);
      totalsAnimationTimeoutRef.current = window.setTimeout(() => {
        setTotalsAnimating(false);
        totalsAnimationTimeoutRef.current = null;
      }, 900);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    if (!autoRefreshEnabled || !isAuthenticated) return;
    const id = window.setInterval(() => {
      fetchTotals();
    }, clampRefreshSeconds(autoRefreshSeconds) * 1000);
    return () => window.clearInterval(id);
  }, [autoRefreshEnabled, autoRefreshSeconds, fetchTotals, isAuthenticated]);

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
    fetchTotals();
  }, [fetchData, fetchTotals, isAuthenticated]);

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

  const handleStatusConfigChange = (
    status: StatusTotalOption,
    field: keyof StatusConfig,
    value: number
  ) => {
    setStatusConfig((prev) => ({
      ...prev,
      [status]: {
        ...prev[status],
        [field]: Number.isFinite(value) && value >= 0 ? value : prev[status][field],
      },
    }));
  };

  const handleAutoRefreshSecondsChange = (value: number) => {
    setAutoRefreshSeconds(clampRefreshSeconds(value));
  };

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => !prev);
  };

  const handleValidateSession = async () => {
    setSessionValidateLoading(true);
    setSessionValidateResult(null);
    try {
      const url = new URL(WEBHOOK_URL);
      url.searchParams.set('resource', 'validar-sessao');
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Falha ao validar sessão (status ${response.status})`);
      }
      const data = await response.json();
      setSessionValidateResult(data);
    } catch (err) {
      setSessionValidateResult({ valido: false, mensagem: err instanceof Error ? err.message : 'Erro ao validar' });
    } finally {
      setSessionValidateLoading(false);
    }
  };

  const handleUpdateSession = async () => {
    if (!sessionUpdateValue.trim()) {
      setSessionUpdateResult({ mensagem: 'Informe um token PHPSESSID.' });
      return;
    }
    setSessionUpdateLoading(true);
    setSessionUpdateResult(null);
    try {
      const url = new URL(WEBHOOK_URL);
      url.searchParams.set('resource', 'update-phpsessid');
      url.searchParams.set('phpsessid', sessionUpdateValue.trim());
      const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
      if (!response.ok) {
        throw new Error(`Falha ao atualizar token (status ${response.status})`);
      }
      const data = await response.json();
      setSessionUpdateResult({ mensagem: `Token atualizado: ${data?.phpSessId ?? 'ok'}` });
    } catch (err) {
      setSessionUpdateResult({ mensagem: err instanceof Error ? err.message : 'Erro ao atualizar token' });
    } finally {
      setSessionUpdateLoading(false);
    }
  };

  const handleRememberChange = (event: ChangeEvent<HTMLInputElement>) => {
    const next = event.target.checked;
    setRememberDevice(next);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AUTH_PREF_KEY, next ? 'true' : 'false');
      if (!next) {
        window.localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    }
  };

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading) return;

    const formData = new FormData(event.currentTarget);
    const username = (formData.get('username') as string | null)?.trim() ?? '';
    const password = (formData.get('password') as string | null) ?? '';

    if (!username || !password) {
      setAuthError('Informe usuário e senha.');
      return;
    }

    setAuthLoading(true);

    const isValid = TEMP_USERS.some((user) => user.username === username && user.password === password);

    if (isValid) {
      setAuthError(null);
      setIsAuthenticated(true);
      setAuthLoading(false);
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(AUTH_PREF_KEY, rememberDevice ? 'true' : 'false');
        if (rememberDevice) {
          window.localStorage.setItem(
            AUTH_STORAGE_KEY,
            JSON.stringify({ username, expiresAt: Date.now() + AUTH_EXPIRATION_MS })
          );
        } else {
          window.localStorage.removeItem(AUTH_STORAGE_KEY);
        }
      }
    } else {
      setAuthError('Credenciais inválidas. Tente novamente.');
      setAuthLoading(false);
      passwordRef.current?.focus();
      passwordRef.current?.select();
    }
  };

  const handleCopy = async (content: string | null | undefined, key: string) => {
    if (!content) {
      return;
    }
    try {
      await navigator.clipboard.writeText(content);
      setCopiedKey(key);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => {
        setCopiedKey(null);
        copyTimeoutRef.current = null;
      }, 2000);
    } catch (err) {
      console.error('[FaturamentosPage] Falha ao copiar XML', err);
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

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    },
    []
  );

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    const timer = window.setTimeout(() => {
      usernameRef.current?.focus({ preventScroll: true });
    }, 100);
    return () => window.clearTimeout(timer);
  }, [isAuthenticated]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 text-slate-100">
        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-md rounded-3xl border border-slate-800 bg-slate-900/80 p-10 shadow-2xl shadow-black/30 backdrop-blur">
            <div className="flex flex-col items-center gap-4">
              <img
                src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
                alt="Porto Itapoá"
                className="h-16 w-full max-w-[200px] object-contain"
              />
              <h1 className="text-2xl font-semibold text-white">Monitor - NFSe Porto Itapoá</h1>
              <p className="text-center text-sm text-slate-400">
                Acesso restrito a usuários autorizados. Utilize as credenciais temporárias fornecidas.
              </p>
            </div>

            <form
              className="mt-8 space-y-5"
              onSubmit={handleAuthSubmit}
              method="post"
              autoComplete="on"
              name="porto-itapoa-auth"
            >
              <div className="space-y-2">
                <label htmlFor="username" className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Usuário
                </label>
                <input
                  ref={usernameRef}
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Digite o usuário"
                />
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-xs uppercase tracking-[0.3em] text-slate-400">
                  Senha
                </label>
                <input
                  ref={passwordRef}
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  className="w-full rounded-xl border border-slate-700/80 bg-slate-950/80 px-4 py-3 text-sm text-white transition focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/40"
                  placeholder="Digite a senha"
                />
              </div>

              <div className="flex items-center justify-between gap-3 text-xs text-slate-400">
                <label className="inline-flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-indigo-500 focus:ring-indigo-400"
                    checked={rememberDevice}
                    onChange={handleRememberChange}
                  />
                  <span>Manter conectado neste navegador</span>
                </label>
                <span className="text-[10px] uppercase tracking-[0.3em] text-slate-500">Expira em 7 dias</span>
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
                className="h-14 w-full max-w-[180px] object-contain md:h-16"
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
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="inline-flex items-center gap-2 self-start rounded-full border border-slate-800 bg-slate-900/70 px-4 py-2 text-sm font-semibold text-slate-100 shadow-lg shadow-black/20 transition hover:border-indigo-400 hover:text-white"
            >
              <GearIcon className="h-4 w-4" />
	              Configurações
	            </button>
	          </div>

	          <section className="rounded-3xl border border-slate-800/70 bg-slate-950/40 p-4 shadow-xl shadow-black/20">
	            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
	              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-200">
	                Totais por status
	              </p>
	            </div>
	            {totalsError && (
	              <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs text-red-200">
	                {totalsError}
	              </div>
	            )}
	            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
	              {STATUS_TOTALS.map((status) => {
	                const value = totals[status];
	                const config = statusConfig[status] ?? defaultStatusConfig(status);
	                const displayed = computeDisplayTotal(value, config);
	                const isAlert = displayed !== null && displayed > config.alertThreshold;
	                return (
	                  <div
	                    key={status}
	                    className={totalStatusClasses(status, displayed ?? null, config, totalsAnimating)}
	                    style={
	                      totalsAnimating
	                        ? { animationDelay: `${STATUS_TOTALS.indexOf(status) * 90}ms` }
	                        : undefined
	                    }
	                  >
	                    <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300">
	                      {status.replace(/_/g, ' ')}
	                    </p>
	                    <p className="text-3xl font-semibold leading-tight">
	                      {displayed !== null ? formatInt(displayed) : totalsLoading ? '...' : '—'}
	                    </p>
	                    <p className={`text-xs ${subtitleColor(status, isAlert)}`}>
	                      {subtitleByStatus(status, config)}
	                    </p>
	                  </div>
	                );
	              })}
	            </div>
	          </section>

	          <div className="flex flex-col gap-4 rounded-3xl border border-slate-800/70 bg-slate-950/30 p-4 shadow-lg shadow-black/15 md:flex-row md:items-end md:justify-between">
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
              onClick={() => {
                fetchData({ interval: intervalFilter, status: statusFilter, reset: true, page: 0 });
                fetchTotals();
	              }}
	              disabled={isLoading}
	              className="inline-flex w-full items-center justify-center rounded-full bg-indigo-500 px-6 py-2 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:bg-indigo-400 disabled:cursor-not-allowed disabled:bg-slate-600 md:w-auto"
	            >
	              {isLoading ? 'Atualizando...' : 'Atualizar agora'}
	            </button>
	          </div>
        </div>
      </header>

	      <main className="mx-auto w-full max-w-6xl px-3 pb-16 pt-8 sm:px-4 md:px-6">
	        <section className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
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

	        <section className="mt-6">
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

                    <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                        <dt className="text-xs uppercase tracking-widest text-slate-400">Tipo</dt>
                        <dd className="mt-1 text-lg font-medium text-slate-100">{item.tipo}</dd>
                      </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-900/45 p-4">
                    <dt className="text-xs uppercase tracking-widest text-slate-400">Data emissão</dt>
                    <dd className="mt-1 text-lg font-medium text-slate-100">{composedData}</dd>
                  </div>
                </dl>

                    {item.status === 'ENVIADO_SAP' && item.resumo && (
                      <div className="mt-5 rounded-2xl border border-emerald-600/30 bg-emerald-900/20 p-4 shadow-inner shadow-emerald-900/30">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200">
                            Resumo completo (SAP)
                          </p>
                          {item.resumo.statusErp && (
                            <span className="inline-flex items-center rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-100">
                              {item.resumo.statusErp.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">Cliente</p>
                            <p className="mt-1 text-sm text-emerald-50">{item.resumo.nomeCliente ?? '—'}</p>
                            {item.resumo.cnpjCliente && (
                              <p className="text-[11px] text-emerald-200/80">CNPJ {item.resumo.cnpjCliente}</p>
                            )}
                          </div>

                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">Valor</p>
                            <p className="mt-1 text-sm font-semibold text-emerald-50">
                              {formatCurrencyBRL(item.resumo.valorTotal)}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">NFSe</p>
                            <p className="mt-1 text-sm text-emerald-50">
                              {item.resumo.nfseNumero
                                ? `#${item.resumo.nfseNumero} · Série ${item.resumo.nfseSerie ?? '—'}`
                                : '—'}
                            </p>
                            {item.resumo.nfseCodVerificadorAutenticidade && (
                              <p className="text-[11px] text-emerald-200/80">
                                {item.resumo.nfseCodVerificadorAutenticidade}
                              </p>
                            )}
                          </div>

                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">Emissão</p>
                            <p className="mt-1 text-sm text-emerald-50">
                              {formatDateTime(item.resumo.nfseDataEmissao, '—')}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">Vencimento</p>
                            <p className="mt-1 text-sm text-emerald-50">
                              {formatDateTime(item.resumo.dataVencimento, '—')}
                            </p>
                          </div>

                          <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
                            <p className="text-[11px] uppercase tracking-[0.28em] text-emerald-200">Links</p>
                            <div className="mt-1 space-y-1 text-sm">
                              {item.resumo.nfseLink && (
                                <a
                                  className="block truncate text-emerald-200 underline decoration-emerald-400/70 decoration-dotted underline-offset-4 hover:text-emerald-100"
                                  href={item.resumo.nfseLink}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver NFSe
                                </a>
                              )}
                              {item.resumo.urlFinalPdfNFSe && (
                                <a
                                  className="block truncate text-emerald-200 underline decoration-emerald-400/70 decoration-dotted underline-offset-4 hover:text-emerald-100"
                                  href={item.resumo.urlFinalPdfNFSe}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  PDF NFSe
                                </a>
                              )}
                              {item.resumo.urlPdfNf && (
                                <a
                                  className="block truncate text-emerald-200 underline decoration-emerald-400/70 decoration-dotted underline-offset-4 hover:text-emerald-100"
                                  href={item.resumo.urlPdfNf}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  PDF Faturamento
                                </a>
                              )}
                              {!item.resumo.nfseLink && !item.resumo.urlFinalPdfNFSe && !item.resumo.urlPdfNf && (
                                <span className="text-emerald-200/70">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <details className="group mt-6">
                      <summary className="flex cursor-pointer list-none items-center justify-between rounded-2xl border border-slate-800 bg-slate-900/55 px-4 py-3 text-sm text-slate-300 transition hover:border-indigo-400 hover:text-white">
                        <span>Schema (XML)</span>
                        <span className="text-xs uppercase tracking-widest text-indigo-300 transition group-open:rotate-180">
                          Expandir
                        </span>
                      </summary>
                      <div className="mt-4 space-y-4 md:grid md:grid-cols-2 md:gap-4 md:space-y-0">
                        <XmlSchemaView
                          xml={item.xml}
                          title="Payload enviado"
                          copied={copiedKey === `${item.id}-payload`}
                          onCopy={() => handleCopy(item.xml, `${item.id}-payload`)}
                        />
                        {item.xmlRetorno && (
                          <XmlSchemaView
                            xml={item.xmlRetorno}
                            title="Retorno prefeitura"
                            accent="emerald"
                            copied={copiedKey === `${item.id}-retorno`}
                            onCopy={() => handleCopy(item.xmlRetorno, `${item.id}-retorno`)}
                          />
                        )}
                      </div>
                    </details>
                  </article>
              );
            })}
          </div>
        </section>
      </main>

      {showSettings && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 backdrop-blur">
          <div className="w-full max-w-4xl rounded-3xl border border-slate-800 bg-slate-900/95 p-6 shadow-2xl shadow-black/40">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-indigo-300">Painel</p>
                <h2 className="text-2xl font-semibold text-white">Configurações</h2>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 text-sm font-semibold text-slate-200 hover:border-indigo-400 hover:text-white"
              >
                Fechar
              </button>
            </div>

            <div className="mt-6 grid gap-6 lg:grid-cols-2">
              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Alertas por status</p>
                    <p className="text-sm text-slate-400">Defina limiar e início de contagem.</p>
                  </div>
                </div>
                <div className="space-y-3 max-h-[360px] overflow-auto pr-1">
                  {STATUS_TOTALS.map((status) => {
                    const conf = statusConfig[status] ?? defaultStatusConfig(status);
                    return (
                      <div
                        key={status}
                        className="rounded-xl border border-slate-800/80 bg-slate-900/60 p-3 shadow-inner shadow-black/10"
                      >
                        <p className="text-[11px] uppercase tracking-[0.18em] text-slate-300 mb-2">
                          {status.replace(/_/g, ' ')}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-xs text-slate-400">
                            <span>Alerta &gt;</span>
                            <input
                              type="number"
                              min={0}
                              value={conf.alertThreshold}
                              onChange={(e) =>
                                handleStatusConfigChange(status, 'alertThreshold', Number(e.target.value))
                              }
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            />
                          </label>
                          <label className="space-y-1 text-xs text-slate-400">
                            <span>Início de contagem</span>
                            <input
                              type="number"
                              min={0}
                              value={conf.startFrom}
                              onChange={(e) => handleStatusConfigChange(status, 'startFrom', Number(e.target.value))}
                              className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Token de sessão</p>
                    <p className="text-sm text-slate-400">Validar e atualizar PHPSESSID.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleValidateSession}
                    disabled={sessionValidateLoading}
                    className="inline-flex items-center gap-2 rounded-full border border-indigo-500/50 bg-indigo-500/10 px-4 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sessionValidateLoading ? 'Validando...' : 'Validar token de sessão'}
                  </button>
                  {sessionValidateResult && (
                    <div
                      className={`rounded-lg border px-3 py-2 text-xs ${
                        sessionValidateResult.valido
                          ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-100'
                          : 'border-red-500/40 bg-red-500/10 text-red-100'
                      }`}
                    >
                      <p className="font-semibold">
                        {sessionValidateResult.valido ? 'Token válido' : 'Token inválido ou erro'}
                      </p>
                      {sessionValidateResult.fileId && <p>fileId: {sessionValidateResult.fileId}</p>}
                      {sessionValidateResult.mensagem && <p>{sessionValidateResult.mensagem}</p>}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Novo PHPSESSID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sessionUpdateValue}
                      onChange={(e) => setSessionUpdateValue(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30"
                      placeholder="Digite o token PHPSESSID"
                    />
                    <button
                      type="button"
                      onClick={handleUpdateSession}
                      disabled={sessionUpdateLoading}
                      className="rounded-full border border-emerald-500/50 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-100 transition hover:border-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {sessionUpdateLoading ? 'Atualizando...' : 'Atualizar'}
                    </button>
                  </div>
                  {sessionUpdateResult && (
                    <p className="text-xs text-slate-200">{sessionUpdateResult.mensagem}</p>
                  )}
                </div>
              </section>

              <section className="space-y-4 rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] uppercase tracking-[0.28em] text-slate-400">Auto refresh</p>
                      <p className="text-sm text-slate-400">Atualizar totais automaticamente.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAutoRefresh}
                      className={`relative h-[1.5rem] w-[2.6rem] rounded-full border transition ${
                        autoRefreshEnabled
                          ? 'border-emerald-400/70 bg-emerald-500/60'
                          : 'border-slate-600 bg-slate-800'
                      }`}
                      aria-pressed={autoRefreshEnabled}
                    >
                      <span
                        className={`absolute top-[0.20rem] left-[0.20rem] h-[1.1rem] w-[1.1rem] rounded-full bg-white shadow transition ${
                          autoRefreshEnabled ? 'translate-x-[1.05rem]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                <div className="space-y-2">
                  <label className="text-xs text-slate-400">Tempo entre refresh (segundos)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      step={1}
                      disabled={!autoRefreshEnabled}
                      value={autoRefreshSeconds}
                      onChange={(e) => handleAutoRefreshSecondsChange(Number(e.target.value))}
                      className="w-20 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-400/30 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-[11px] text-slate-500">
                      Min 5s · Max 120s · Desligado por padrão.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaturamentosPage;
