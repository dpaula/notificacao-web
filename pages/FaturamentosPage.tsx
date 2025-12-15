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

const RefreshIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M20 11a8 8 0 0 0-14.66-4" />
    <path d="M4 4v4h4" />
    <path d="M4 13a8 8 0 0 0 14.66 4" />
    <path d="M20 20v-4h-4" />
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

const DEFAULT_STATUS_START_FROM: Record<StatusTotalOption, number> = {
  PENDENTE: 0,
  DRAFT_PENDENTE: 58,
  PROCESSANDO_INTEGRACAO: 5,
  ERRO_PREFEITURA: 0,
  ERRO_SAP: 1814,
  ENVIADO_SAP: 0,
  ERRO_PROCESSAMENTO: 9,
};

const defaultStatusConfig = (status: StatusTotalOption): StatusConfig => {
  const startFrom = DEFAULT_STATUS_START_FROM[status] ?? 0;

  if (['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) {
    return { alertThreshold: 0, startFrom };
  }
  if (['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'].includes(status)) {
    return { alertThreshold: 20, startFrom };
  }
  return { alertThreshold: 0, startFrom };
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
  const base = 'badge';
  const warnStatuses: StatusOption[] = ['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'];

  if (status.startsWith('ERRO')) return `${base} badge-danger`;
  if (warnStatuses.includes(status as StatusOption)) return `${base} badge-warn`;
  if (status === 'ENVIADO_SAP') return `${base} badge-ok`;
  return `${base} badge-soft`;
};

const totalStatusClasses = (
  status: StatusTotalOption,
  adjustedValue: number | null,
  config: StatusConfig,
  animating: boolean
): string => {
  const base = 'card status-card flex flex-col items-center justify-center gap-2';
  const safeValue = typeof adjustedValue === 'number' ? adjustedValue : 0;

  const warnStatuses: StatusTotalOption[] = ['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'];
  const errorStatuses: StatusTotalOption[] = ['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'];

  const isAlert = safeValue > config.alertThreshold;
  const loadingClasses = animating ? 'animate-pulse-soft totals-card-sheen' : '';

  if (isAlert && errorStatuses.includes(status)) {
    return `${base} status-card--danger ${loadingClasses}`;
  }

  if (isAlert && warnStatuses.includes(status)) {
    return `${base} status-card--warn ${loadingClasses}`;
  }

  return `${base} ${loadingClasses}`;
};

const subtitleByStatus = (status: StatusTotalOption, config: StatusConfig): string => {
  if (status === 'ENVIADO_SAP') return 'Fluxos concluídos';
  if (['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) {
    return `Alerta total > ${config.alertThreshold}`;
  }
  return `Alerta > ${config.alertThreshold}`;
};

const subtitleColor = (status: StatusTotalOption, isAlert: boolean): string => {
  const warnStatuses: StatusTotalOption[] = ['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'];
  const errorStatuses: StatusTotalOption[] = ['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'];

  if (isAlert && errorStatuses.includes(status)) return 'text-brand-red';
  if (isAlert && warnStatuses.includes(status)) return 'text-brand-lime';
  if (status === 'ENVIADO_SAP') return 'text-brand-lime';
  return 'text-subtle';
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
        className="group card card-ring"
      >
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2 text-sm transition hover:bg-[rgba(255,255,255,0.03)]">
          <span className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-slate-800/90 text-[11px] font-semibold uppercase tracking-[0.35em] text-slate-300">
              {hasChildren ? '<>' : 'ab'}
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white">{node.name}</span>
          </span>
          {summaryValue && (
            <span className="truncate text-[11px] text-muted">{summaryValue}</span>
          )}
        </summary>
        <div className="space-y-3 border-t border-[rgba(255,255,255,0.06)] px-4 py-3 text-sm">
          {node.value && (
            <pre className="whitespace-pre-wrap break-words rounded-lg bg-[rgba(255,255,255,0.03)] px-3 py-2 text-sm text-white">
              {node.value}
            </pre>
          )}

          {hasAttributes && (
            <div className="space-y-2">
              {Object.entries(node.attributes).map(([key, value]) => (
                <div
                  key={key}
                  className="card card-ring bg-[rgba(0,112,80,0.10)] px-3 py-2 text-xs text-white"
                >
                  <p className="text-[10px] font-semibold uppercase tracking-[0.32em] text-brand-teal">@ {key}</p>
                  <p className="mt-1 break-words text-muted">{value}</p>
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

  const isLime = accent === 'emerald';
  const containerClassName = isLime ? 'card card-ring bg-[rgba(144,192,48,0.06)]' : 'card card-ring';
  const iconButtonClassName = isLime ? 'icon-btn icon-btn--lime' : 'icon-btn';
  const badgeClassName = isLime ? 'text-brand-lime' : 'text-brand-teal';

  if (!xml || !xml.trim()) {
    return (
      <div className={`${containerClassName} p-4 text-xs text-muted`}>
        Nenhum dado disponível.
      </div>
    );
  }

  return (
    <div className={`${containerClassName} p-4`}>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">{title}</p>
        <button
          type="button"
          onClick={onCopy}
          className={iconButtonClassName}
          aria-label={`Copiar ${title}`}
        >
          <CopyIcon className="h-4 w-4" />
        </button>
      </div>

      {tree ? (
        <div className="card card-ring max-h-[28rem] overflow-auto bg-[rgba(255,255,255,0.02)] px-4 py-4">
          <SchemaNodeRow node={tree} />
        </div>
      ) : (
        <pre className="card card-ring max-h-[28rem] overflow-auto bg-[rgba(255,255,255,0.02)] p-4 text-xs font-mono text-white">
          {xml}
        </pre>
      )}

      {copied && (
        <span className={`mt-3 inline-flex text-[10px] font-semibold uppercase tracking-[0.32em] ${badgeClassName}`}>
          Copiado
        </span>
      )}
    </div>
  );
};

type TotalsSegment = {
  key: string;
  label: string;
  value: number;
  className: string;
};

const TotalsDistributionBar: React.FC<{
  segments: TotalsSegment[];
  loading: boolean;
  animating: boolean;
}> = ({ segments, loading, animating }) => {
  const total = segments.reduce((acc, segment) => acc + (segment.value ?? 0), 0);
  const visibleSegments = segments.filter((segment) => segment.value > 0);

  return (
    <div
      className={`card card-ring relative overflow-hidden p-4 ${animating ? 'totals-card-sheen' : ''}`}
      aria-label="Distribuição dos totais por status"
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Distribuição</p>
        <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-muted">
          {total > 0 ? formatInt(total) : loading ? '…' : '—'}
        </span>
      </div>

      <div
        className={`mt-3 flex h-3 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)] ${
          loading ? 'animate-pulse-soft' : ''
        }`}
      >
        {total > 0 && visibleSegments.length > 0 ? (
          visibleSegments.map((segment) => (
            <div
              key={segment.key}
              title={`${segment.label}: ${formatInt(segment.value)}`}
              className={segment.className}
              style={{
                flexGrow: segment.value,
                minWidth: segment.value > 0 ? 6 : 0,
              }}
            />
          ))
        ) : (
          <div className="h-full w-full bg-[rgba(255,255,255,0.04)]" />
        )}
      </div>
    </div>
  );
};

type TotalsTileVariant = 'teal' | 'lime' | 'red';

const TotalsSummaryTile: React.FC<{
  label: string;
  value: number | null;
  hint: string;
  variant: TotalsTileVariant;
  loading: boolean;
  animating: boolean;
}> = ({ label, value, hint, variant, loading, animating }) => {
  const isLoading = loading && value === null;
  const displayValue = value !== null ? formatInt(value) : isLoading ? '…' : '—';

  const dotClassName =
    variant === 'red'
      ? 'bg-[rgba(224,32,32,0.85)]'
      : variant === 'lime'
      ? 'bg-[rgba(144,192,48,0.80)]'
      : 'bg-[rgba(0,112,80,0.82)]';

  return (
    <div
      className={`card card-ring relative overflow-hidden p-4 ${
        animating ? 'animate-pulse-soft totals-card-sheen' : ''
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClassName}`} aria-hidden="true" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.20em] text-subtle">{label}</p>
      </div>
      <p className="mt-3 text-2xl font-semibold leading-none text-white">{displayValue}</p>
      <p className="mt-1 text-xs text-muted">{hint}</p>
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
  const [totalsDetailsOpen, setTotalsDetailsOpen] = useState<boolean>(false);
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
  const [topBarVisible, setTopBarVisible] = useState<boolean>(false);
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!isAuthenticated) return;

    let rafId: number | null = null;
    const threshold = 48;

    const update = () => {
      rafId = null;
      setTopBarVisible(window.scrollY > threshold);
    };

    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(update);
    };

    update();
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      window.removeEventListener('scroll', onScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [isAuthenticated]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!showSettings) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowSettings(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showSettings]);

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

  const totalsDisplayedByStatus = useMemo(() => {
    return STATUS_TOTALS.reduce<Record<StatusTotalOption, number | null>>((acc, status) => {
      const config = statusConfig[status] ?? defaultStatusConfig(status);
      acc[status] = computeDisplayTotal(totals[status], config);
      return acc;
    }, {} as Record<StatusTotalOption, number | null>);
  }, [statusConfig, totals]);

  const totalsHasAnyValue = useMemo(
    () => STATUS_TOTALS.some((status) => totalsDisplayedByStatus[status] !== null),
    [totalsDisplayedByStatus]
  );

  const totalsGroups = useMemo(() => {
    const sumOrNull = (statuses: StatusTotalOption[]): number | null => {
      const values = statuses.map((status) => totalsDisplayedByStatus[status]);
      if (!values.some((value) => typeof value === 'number')) return null;
      return values.reduce((acc, value) => acc + (typeof value === 'number' ? value : 0), 0);
    };

    return {
      pendencias: sumOrNull(['PENDENTE', 'DRAFT_PENDENTE']),
      processando: totalsDisplayedByStatus.PROCESSANDO_INTEGRACAO,
      erros: sumOrNull(['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO']),
      enviado: totalsDisplayedByStatus.ENVIADO_SAP,
    };
  }, [totalsDisplayedByStatus]);

  const totalsSegments = useMemo<TotalsSegment[]>(() => {
    const safe = (value: number | null) => (typeof value === 'number' ? value : 0);
    return [
      {
        key: 'pendencias',
        label: 'Pendências',
        value: safe(totalsGroups.pendencias),
        className: 'bg-[rgba(144,192,48,0.72)]',
      },
      {
        key: 'processando',
        label: 'Processando',
        value: safe(totalsGroups.processando),
        className: 'bg-[rgba(144,192,48,0.36)]',
      },
      {
        key: 'erros',
        label: 'Erros',
        value: safe(totalsGroups.erros),
        className: 'bg-[rgba(224,32,32,0.72)]',
      },
    ];
  }, [totalsGroups]);

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
	      <div className="app-shell">
	        <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col items-center justify-center px-6 py-12">
	          <div className="surface w-full max-w-md p-10">
	            <div className="flex flex-col items-center gap-4">
	              <img
	                src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
	                alt="Porto Itapoá"
	                className="h-16 w-full max-w-[200px] object-contain"
	              />
	              <h1 className="text-2xl font-semibold text-white">Monitor - NFSe Porto Itapoá</h1>
	              <p className="text-center text-sm text-muted">
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
	                <label htmlFor="username" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-subtle">
	                  Usuário
	                </label>
	                <input
	                  ref={usernameRef}
	                  id="username"
	                  name="username"
	                  type="text"
	                  autoComplete="username"
	                  required
	                  className="input-field input-field-rect text-sm"
	                  placeholder="Digite o usuário"
	                />
	              </div>
	              <div className="space-y-2">
	                <label htmlFor="password" className="text-[11px] font-semibold uppercase tracking-[0.3em] text-subtle">
	                  Senha
	                </label>
	                <input
	                  ref={passwordRef}
	                  id="password"
	                  name="password"
	                  type="password"
	                  autoComplete="current-password"
	                  required
	                  className="input-field input-field-rect text-sm"
	                  placeholder="Digite a senha"
	                />
	              </div>
	
	              <div className="flex items-center justify-between gap-3 text-xs text-muted">
	                <label className="inline-flex items-center gap-2">
	                  <input
	                    type="checkbox"
	                    className="h-4 w-4 rounded border-slate-600 bg-slate-900 text-[color:var(--brand-teal)] focus:ring-[color:rgba(0,112,80,0.35)]"
	                    checked={rememberDevice}
	                    onChange={handleRememberChange}
	                  />
	                  <span>Manter conectado neste navegador</span>
	                </label>
	                <span className="text-[10px] uppercase tracking-[0.3em] text-subtle">Expira em 7 dias</span>
	              </div>
	
	              {authError && (
	                <div className="card card-ring bg-[rgba(224,32,32,0.10)] px-4 py-3 text-xs text-brand-red">
	                  {authError}
	                </div>
	              )}
	
	              <button
	                type="submit"
	                disabled={authLoading}
	                className="btn btn-primary w-full text-sm disabled:cursor-not-allowed"
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
    <div className="app-shell">
      <div
        className={`fixed inset-x-0 top-0 z-40 transition duration-200 ease-out ${
          topBarVisible ? 'translate-y-0 opacity-100' : '-translate-y-2 opacity-0 pointer-events-none'
        }`}
        aria-hidden={!topBarVisible}
      >
        <div className="topbar-glass topbar-safe">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="flex h-14 items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <img
                  src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
                  alt="Porto Itapoá"
                  className="h-6 w-auto shrink-0 object-contain opacity-95"
                />
                <div className="min-w-0">
                  <p className="topbar-title truncate text-sm">Monitor - NFSe Porto Itapoá</p>
                  <p className="hidden truncate text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle sm:block">
                    Painel de Faturamentos
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    fetchData({ interval: intervalFilter, status: statusFilter, reset: true, page: 0 });
                    fetchTotals();
                  }}
                  disabled={isLoading}
                  className="icon-btn disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Atualizar dados"
                >
                  <RefreshIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setShowSettings(true)}
                  className="icon-btn"
                  aria-label="Abrir configurações"
                >
                  <GearIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <header className="pb-6 pt-6 sm:pt-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 sm:px-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:gap-6">
              <img
                src="https://www.portoitapoa.com/wp-content/uploads/2020/10/logo-grande-1.png"
                alt="Porto Itapoá"
                className="h-12 w-full max-w-[168px] object-contain md:h-14"
              />
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
                  Painel de Faturamentos
                </p>
                <h1 className="mt-2 text-2xl font-semibold text-white sm:text-3xl">Monitor - NFSe Porto Itapoá</h1>
                <p className="mt-2 max-w-2xl text-sm text-muted">
                  Consulta dos processos de faturamento recebidos do SAP e integrações Prefeitura.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setShowSettings(true)}
              className="btn btn-ghost inline-flex items-center gap-2 self-start text-sm"
            >
              <GearIcon className="h-4 w-4" />
              Configurações
            </button>
          </div>

          <section className="surface p-4">
            {totalsError && (
              <div className="mb-4 rounded-2xl bg-[rgba(224,32,32,0.12)] px-4 py-3 text-xs text-brand-red shadow-[inset_0_0_0_1px_rgba(224,32,32,0.22)]">
                {totalsError}
              </div>
            )}

            <div className="md:hidden">
              <div className="flex items-center justify-between gap-3 px-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Visão geral</p>
                <button
                  type="button"
                  onClick={() => setTotalsDetailsOpen((prev) => !prev)}
                  className="btn btn-ghost text-xs"
                  aria-expanded={totalsDetailsOpen}
                >
                  {totalsDetailsOpen ? 'Ocultar detalhes' : 'Ver detalhes'}
                </button>
              </div>

              <div className="mt-3 space-y-3">
                <TotalsDistributionBar
                  segments={totalsSegments}
                  loading={totalsLoading || !totalsHasAnyValue}
                  animating={totalsAnimating}
                />

                <div className="grid grid-cols-2 gap-3">
                  <TotalsSummaryTile
                    label="Pendências"
                    value={totalsGroups.pendencias}
                    hint="Pendente + Draft"
                    variant="lime"
                    loading={totalsLoading || !totalsHasAnyValue}
                    animating={totalsAnimating}
                  />
                  <TotalsSummaryTile
                    label="Processando"
                    value={totalsGroups.processando}
                    hint="Integração em andamento"
                    variant="teal"
                    loading={totalsLoading || !totalsHasAnyValue}
                    animating={totalsAnimating}
                  />
                  <TotalsSummaryTile
                    label="Erros"
                    value={totalsGroups.erros}
                    hint="Prefeitura · SAP · Proc."
                    variant="red"
                    loading={totalsLoading || !totalsHasAnyValue}
                    animating={totalsAnimating}
                  />
                  <TotalsSummaryTile
                    label="Enviado SAP"
                    value={totalsGroups.enviado}
                    hint="Fluxos concluídos"
                    variant="teal"
                    loading={totalsLoading || !totalsHasAnyValue}
                    animating={totalsAnimating}
                  />
                </div>

                {totalsDetailsOpen && (
                  <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {STATUS_TOTALS.map((status) => {
                      const config = statusConfig[status] ?? defaultStatusConfig(status);
                      const displayed = totalsDisplayedByStatus[status];
                      const isAlert = displayed !== null && displayed > config.alertThreshold;

                      return (
                        <div
                          key={status}
                          className={totalStatusClasses(status, displayed, config, totalsAnimating)}
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                            {status.replace(/_/g, ' ')}
                          </p>
                          <p className="text-3xl font-semibold leading-tight text-white">
                            {displayed !== null ? formatInt(displayed) : totalsLoading ? '...' : '—'}
                          </p>
                          <p className={`text-xs ${subtitleColor(status, isAlert)}`}>
                            {subtitleByStatus(status, config)}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="hidden md:grid md:grid-cols-3 md:gap-4 lg:grid-cols-4 xl:grid-cols-7">
              {STATUS_TOTALS.map((status) => {
                const config = statusConfig[status] ?? defaultStatusConfig(status);
                const displayed = totalsDisplayedByStatus[status];
                const isAlert = displayed !== null && displayed > config.alertThreshold;

                return (
                  <div
                    key={status}
                    className={totalStatusClasses(status, displayed, config, totalsAnimating)}
                    style={
                      totalsAnimating
                        ? { animationDelay: `${STATUS_TOTALS.indexOf(status) * 90}ms` }
                        : undefined
                    }
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                      {status.replace(/_/g, ' ')}
                    </p>
                    <p className="text-3xl font-semibold leading-tight text-white">
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

          <div className="surface flex flex-col gap-4 p-4 md:flex-row md:items-end md:justify-between">
            <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                Intervalo
                <div className="relative">
                  <select
                    value={intervalFilter}
                    onChange={handleIntervalChange}
                    className="input-field select-field pr-10 text-sm font-semibold"
                  >
                    {INTERVAL_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-subtle">
                    ▾
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                Status
                <div className="relative">
                  <select
                    value={statusFilter}
                    onChange={handleStatusChange}
                    className="input-field select-field pr-10 text-sm font-semibold"
                  >
                    <option value="">--</option>
                    {STATUS_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-subtle">
                    ▾
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                Draft
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    placeholder="Ex.: 6841"
                    value={draftFilter}
                    onChange={handleDraftChange}
                    className="input-field pr-10 text-sm font-semibold"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-subtle">
                    #
                  </span>
                </div>
              </label>

              <label className="flex flex-col gap-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                Ordenar por
                <div className="relative">
                  <select
                    value={sortOption}
                    onChange={handleSortChange}
                    className="input-field select-field pr-10 text-sm font-semibold"
                  >
                    <option value="date">Data (mais recentes)</option>
                    <option value="draft">Draft (crescente)</option>
                    <option value="status">Status (A-Z)</option>
                  </select>
                  <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-subtle">
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
              className="btn btn-primary inline-flex w-full items-center justify-center text-sm md:w-auto"
            >
              {isLoading ? 'Atualizando...' : 'Atualizar agora'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-6 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="card card-ring kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Processos</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.totalProcessos}</p>
            <p className="mt-1 text-xs text-muted">Total retornado pelo webhook</p>
          </div>
          <div className="card card-ring kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Status distintos</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.statusUnicos}</p>
            <p className="mt-1 text-xs text-muted">Quantidade de status encontrados</p>
          </div>
          <div className="card card-ring kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Notas emitidas</p>
            <p className="mt-2 text-3xl font-semibold text-white">{summary.emitidas}</p>
            <p className="mt-1 text-xs text-muted">Com `data_nfse` disponível</p>
          </div>
          <div className="card card-ring kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Última atualização</p>
            <p className="mt-2 text-base font-semibold text-white">
              {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : '—'}
            </p>
            <p className="mt-1 text-xs text-muted">Horário da última consulta manual</p>
          </div>
        </section>

        <section className="mt-6">
          {error && (
            <div className="card card-ring bg-[rgba(224,32,32,0.08)] p-6 text-sm text-brand-red">
              {error}
            </div>
          )}

          {!error && isLoading && (
            <div className="card card-ring p-8 text-center text-sm text-muted">
              Carregando processos de faturamento...
            </div>
          )}

          {!isLoading && !error && items.length === 0 && (
            <div className="card card-ring p-8 text-center text-sm text-muted">
              Nenhum processo localizado no webhook para os filtros selecionados.
            </div>
          )}

          {!isLoading && !error && items.length > 0 && filteredItems.length === 0 && (
            <div className="card card-ring p-8 text-center text-sm text-muted">
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
                  className="card card-ring p-4 transition hover:shadow-[0_20px_60px_-44px_rgba(0,112,80,0.35)] sm:p-6"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-brand-teal">
                        Draft {item.draft}
                      </p>
                      <h2 className="mt-2 text-xl font-semibold text-white sm:text-2xl">
                        {cliente ?? 'Cliente não identificado'}
                      </h2>
                      <p className="mt-1 text-sm text-muted">
                        {observacao ?? 'Sem observações registradas.'}
                      </p>
                    </div>
                    <div className="flex flex-col items-start gap-2 md:items-end">
                      <span className={statusBadgeClassName(item.status)}>
                        {item.status.replace(/_/g, ' ')}
                      </span>
                      {numeroNf && (
                        <span className="badge badge-soft">NFSe {numeroNf}</span>
                      )}
                      <span className="text-xs text-subtle">
                        Atualizado {formatDateTime(item.alteradoEm)} · Criado {formatDateTime(item.criadoEm)}
                      </span>
                    </div>
                  </div>

                  <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                    <div className="card card-ring p-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Tipo</dt>
                      <dd className="mt-1 text-lg font-medium text-white">{item.tipo}</dd>
                    </div>
                    <div className="card card-ring p-4">
                      <dt className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                        Data emissão
                      </dt>
                      <dd className="mt-1 text-lg font-medium text-white">{composedData}</dd>
                    </div>
                  </dl>

                    {item.status === 'ENVIADO_SAP' && item.resumo && (
                      <div className="mt-5 card card-ring bg-[rgba(0,112,80,0.08)] p-4">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-brand-lime">
                            Resumo completo (SAP)
                          </p>
                          {item.resumo.statusErp && (
                            <span className="badge badge-ok">
                              {item.resumo.statusErp.replace(/_/g, ' ')}
                            </span>
                          )}
                        </div>

                        <div className="mt-4 grid gap-3 sm:grid-cols-2 md:grid-cols-3">
                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Cliente</p>
                            <p className="mt-1 text-sm text-white">{item.resumo.nomeCliente ?? '—'}</p>
                            {item.resumo.cnpjCliente && (
                              <p className="text-[11px] text-muted">CNPJ {item.resumo.cnpjCliente}</p>
                            )}
                          </div>

                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Valor</p>
                            <p className="mt-1 text-sm font-semibold text-white">
                              {formatCurrencyBRL(item.resumo.valorTotal)}
                            </p>
                          </div>

                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">NFSe</p>
                            <p className="mt-1 text-sm text-white">
                              {item.resumo.nfseNumero
                                ? `#${item.resumo.nfseNumero} · Série ${item.resumo.nfseSerie ?? '—'}`
                                : '—'}
                            </p>
                            {item.resumo.nfseCodVerificadorAutenticidade && (
                              <p className="text-[11px] text-muted">{item.resumo.nfseCodVerificadorAutenticidade}</p>
                            )}
                          </div>

                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Emissão</p>
                            <p className="mt-1 text-sm text-white">{formatDateTime(item.resumo.nfseDataEmissao, '—')}</p>
                          </div>

                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                              Vencimento
                            </p>
                            <p className="mt-1 text-sm text-white">{formatDateTime(item.resumo.dataVencimento, '—')}</p>
                          </div>

                          <div className="card card-ring p-3">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Links</p>
                            <div className="mt-1 space-y-1 text-sm">
                              {item.resumo.nfseLink && (
                                <a
                                  className="block truncate text-brand-lime underline decoration-[rgba(144,192,48,0.55)] decoration-dotted underline-offset-4 hover:text-white"
                                  href={item.resumo.nfseLink}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Ver NFSe
                                </a>
                              )}
                              {item.resumo.urlFinalPdfNFSe && (
                                <a
                                  className="block truncate text-brand-lime underline decoration-[rgba(144,192,48,0.55)] decoration-dotted underline-offset-4 hover:text-white"
                                  href={item.resumo.urlFinalPdfNFSe}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  PDF NFSe
                                </a>
                              )}
                              {item.resumo.urlPdfNf && (
                                <a
                                  className="block truncate text-brand-lime underline decoration-[rgba(144,192,48,0.55)] decoration-dotted underline-offset-4 hover:text-white"
                                  href={item.resumo.urlPdfNf}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  PDF Faturamento
                                </a>
                              )}
                              {!item.resumo.nfseLink && !item.resumo.urlFinalPdfNFSe && !item.resumo.urlPdfNf && (
                                <span className="text-muted">—</span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    <details className="group mt-6">
                      <summary className="card card-ring flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm text-muted transition hover:shadow-[0_18px_50px_-40px_rgba(0,112,80,0.25)]">
                        <span className="text-white">Schema (XML)</span>
                        <span className="text-[11px] font-semibold uppercase tracking-[0.24em] text-brand-teal transition group-open:rotate-180">
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
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setShowSettings(false)}
        >
          <div
            className="surface surface-sheet flex w-full max-h-[92vh] flex-col overflow-hidden sm:mx-4 md:max-w-4xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(5,7,20,0.35)] px-4 pb-4 pt-4 backdrop-blur sm:px-6 sm:pt-6">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[rgba(255,255,255,0.14)] md:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Painel</p>
                  <h2 className="text-2xl font-semibold text-white">Configurações</h2>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSettings(false)}
                  className="btn btn-ghost text-sm"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-5 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-2">
              <section className="card card-ring space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Alertas por status</p>
                    <p className="text-sm text-muted">Defina limiar e início de contagem.</p>
                  </div>
                </div>
                <div className="space-y-3 md:max-h-[360px] md:overflow-auto md:pr-1">
                  {STATUS_TOTALS.map((status) => {
                    const conf = statusConfig[status] ?? defaultStatusConfig(status);
                    return (
                      <div
                        key={status}
                        className="card card-ring p-3"
                      >
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                          {status.replace(/_/g, ' ')}
                        </p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                          <label className="space-y-1 text-xs text-muted">
                            <span>Alerta &gt;</span>
                            <input
                              type="number"
                              min={0}
                              value={conf.alertThreshold}
                              onChange={(e) =>
                                handleStatusConfigChange(status, 'alertThreshold', Number(e.target.value))
                              }
                              className="input-field input-field-rect text-sm"
                            />
                          </label>
                          <label className="space-y-1 text-xs text-muted">
                            <span>Início de contagem</span>
                            <input
                              type="number"
                              min={0}
                              value={conf.startFrom}
                              onChange={(e) => handleStatusConfigChange(status, 'startFrom', Number(e.target.value))}
                              className="input-field input-field-rect text-sm"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              <section className="card card-ring space-y-4 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Token de sessão</p>
                    <p className="text-sm text-muted">Validar e atualizar PHPSESSID.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleValidateSession}
                    disabled={sessionValidateLoading}
                    className="btn btn-ghost inline-flex items-center gap-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {sessionValidateLoading ? 'Validando...' : 'Validar token de sessão'}
                  </button>
                  {sessionValidateResult && (
                    <div
                      className={`card card-ring px-3 py-2 text-xs ${
                        sessionValidateResult.valido
                          ? 'bg-[rgba(0,112,80,0.10)] text-white'
                          : 'bg-[rgba(224,32,32,0.10)] text-white'
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
                  <label className="text-xs text-muted">Novo PHPSESSID</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={sessionUpdateValue}
                      onChange={(e) => setSessionUpdateValue(e.target.value)}
                      className="input-field input-field-rect flex-1 text-sm"
                      placeholder="Digite o token PHPSESSID"
                    />
                    <button
                      type="button"
                      onClick={handleUpdateSession}
                      disabled={sessionUpdateLoading}
                      className="btn btn-primary text-sm disabled:cursor-not-allowed"
                    >
                      {sessionUpdateLoading ? 'Atualizando...' : 'Atualizar'}
                    </button>
                  </div>
                  {sessionUpdateResult && (
                    <p className="text-xs text-muted">{sessionUpdateResult.mensagem}</p>
                  )}
                </div>
              </section>

              <section className="card card-ring space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Auto refresh</p>
                      <p className="text-sm text-muted">Atualizar totais automaticamente.</p>
                    </div>
                    <button
                      type="button"
                      onClick={toggleAutoRefresh}
                      className={`relative h-[1.75rem] w-[3.1rem] rounded-full border transition ${
                        autoRefreshEnabled
                          ? 'border-[rgba(0,112,80,0.65)] bg-[rgba(0,112,80,0.55)]'
                          : 'border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.06)]'
                      }`}
                      aria-pressed={autoRefreshEnabled}
                    >
                      <span
                        className={`absolute top-[0.20rem] left-[0.20rem] h-[1.35rem] w-[1.35rem] rounded-full bg-white shadow transition ${
                          autoRefreshEnabled ? 'translate-x-[1.35rem]' : 'translate-x-0'
                        }`}
                      />
                    </button>
                  </div>

                <div className="space-y-2">
                  <label className="text-xs text-muted">Tempo entre refresh (segundos)</label>
                  <div className="flex items-center gap-3">
                    <input
                      type="number"
                      min={5}
                      max={120}
                      step={1}
                      disabled={!autoRefreshEnabled}
                      value={autoRefreshSeconds}
                      onChange={(e) => handleAutoRefreshSecondsChange(Number(e.target.value))}
                      className="input-field input-field-rect w-20 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <span className="text-[11px] text-subtle">
                      Min 5s · Max 120s · Desligado por padrão.
                    </span>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default FaturamentosPage;
