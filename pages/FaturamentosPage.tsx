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
const PHPSESSID_PORTAL_URL = 'https://nfse-itapoa.atende.net/';
const PHPSESSID_VIDEO_URL = '/assets/videos/pegar_phpsessid_web.mp4';
const PHPSESSID_VIDEO_POSTER_URL = '/assets/videos/pegar_phpsessid_poster.webp';
const PHPSESSID_VIDEO_LABEL = 'Como pegar o PHPSESSID (26s)';

const INTERVAL_OPTIONS = ['15m', '30m', '60m', '120m', '240m'] as const;
type IntervalOption = (typeof INTERVAL_OPTIONS)[number];
const LIST_BATCH_SIZE = 10;
const SESSION_VALIDATE_DEFAULT_INTERVAL_MS = 15 * 60 * 1000;
const SESSION_VALIDATE_ALERT_INTERVAL_MS = 60 * 1000;

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
  notifyWhatsApp: boolean;
  notifyAfterMinutes: number;
};

type StatusConfigMap = Record<StatusTotalOption, StatusConfig>;

type SessionTokenAlertConfig = {
  notifyWhatsApp: boolean;
  notifyAfterMinutes: number;
};

type SessionValidateResult = {
  valido: boolean;
  fileId?: string;
  mensagem?: string;
};

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

const EyeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const EyeOffIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <path d="M3 3l18 18" />
    <path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" />
    <path d="M9.5 5.2A10.5 10.5 0 0 1 12 5c6.5 0 10 7 10 7a18.2 18.2 0 0 1-4 5.2" />
    <path d="M6.3 6.3C3.6 8.2 2 12 2 12s3.5 7 10 7c1 0 2-.1 2.9-.4" />
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

const BellIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 7h18s-3 0-3-7" />
    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
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

const PlayIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
    <path d="M8.5 5.5v13l11-6.5-11-6.5z" />
  </svg>
);

type SwitchButtonProps = {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  ariaLabel?: string;
};

const SwitchButton: React.FC<SwitchButtonProps> = ({ checked, onToggle, disabled = false, ariaLabel }) => (
  <button
    type="button"
    onClick={onToggle}
    disabled={disabled}
    aria-pressed={checked}
    aria-label={ariaLabel}
    className={`relative h-[1.75rem] w-[3.1rem] rounded-full border transition ${
      checked
        ? 'border-[rgba(0,112,80,0.65)] bg-[rgba(0,112,80,0.55)]'
        : 'border-[rgba(255,255,255,0.18)] bg-[rgba(255,255,255,0.06)]'
    } disabled:cursor-not-allowed disabled:opacity-50`}
  >
    <span
      className={`absolute top-[0.20rem] left-[0.20rem] h-[1.35rem] w-[1.35rem] rounded-full bg-white shadow transition ${
        checked ? 'translate-x-[1.35rem]' : 'translate-x-0'
      }`}
    />
  </button>
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

const formatTimeShort = (date?: Date | null): string => {
  if (!date) return '—';
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(date);
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
const SESSION_ALERT_CONFIG_STORAGE_KEY = 'porto_nfse_session_alert_config';
const TOTALS_REFRESH_STORAGE_KEY = 'porto_nfse_totals_refresh';
const WHATSAPP_PROFILE_COOKIE_KEY = 'porto_nfse_whatsapp_profile';
const WHATSAPP_VERIFICATION_STORAGE_KEY = 'porto_nfse_whatsapp_verification';
const STATUS_ALERT_STATE_STORAGE_KEY = 'porto_nfse_status_alert_state';
const SESSION_ALERT_STATE_STORAGE_KEY = 'porto_nfse_session_alert_state';

const WHATSAPP_PROFILE_COOKIE_DAYS = 90;
const WHATSAPP_CODE_TTL_MS = 1000 * 60 * 5;
const WHATSAPP_CODE_COOLDOWN_MS = 1000 * 30;
const DEFAULT_STATUS_NOTIFY_AFTER_MINUTES = 120;
const MIN_STATUS_NOTIFY_AFTER_MINUTES = 5;
const MAX_STATUS_NOTIFY_AFTER_MINUTES = 360;
const DEFAULT_SESSION_NOTIFY_AFTER_MINUTES = 120;
const MIN_SESSION_NOTIFY_AFTER_MINUTES = 5;
const MAX_SESSION_NOTIFY_AFTER_MINUTES = 240;
const WHATSAPP_COOKIE_PATH = '/faturamentos';

type WhatsAppProfile = {
  numero: string;
  verifiedAt: number;
};

type WhatsAppVerificationState = {
  numero: string;
  code: string;
  sentAt: number;
  expiresAt: number;
};

type NotificationChannel = 'email' | 'push' | 'whatsapp';

const normalizeDigits = (value: string): string => value.replace(/\D/g, '');

const stripBrazilCountryCode = (value: string): string => {
  const digits = normalizeDigits(value);
  return digits.startsWith('55') ? digits.slice(2) : digits;
};

const normalizeBrazilWhatsAppNumber = (value: string): string => {
  const digits = stripBrazilCountryCode(value);
  if (!digits || digits.length < 10 || digits.length > 11) return '';
  return `55${digits}`;
};

const formatBrazilPhoneMask = (value: string): string => {
  const digits = stripBrazilCountryCode(value).slice(0, 11);
  if (!digits) return '';

  if (digits.length < 3) return `(${digits}`;

  const ddd = digits.slice(0, 2);
  const rest = digits.slice(2);
  let formatted = `(${ddd})`;
  if (!rest) return formatted;

  const isMobile = digits.length === 11 || rest.startsWith('9');
  if (isMobile) {
    const first = rest.slice(0, 1);
    const part1 = rest.slice(1, 5);
    const part2 = rest.slice(5, 9);
    formatted += first;
    if (rest.length > 1) formatted += ` ${part1}`;
    if (rest.length > 5) formatted += `-${part2}`;
    return formatted;
  }

  const part1 = rest.slice(0, 4);
  const part2 = rest.slice(4, 8);
  formatted += part1;
  if (rest.length > 4) formatted += `-${part2}`;
  return formatted;
};

const formatBrazilWhatsAppDisplay = (value: string): string => {
  const digits = stripBrazilCountryCode(value);
  const masked = formatBrazilPhoneMask(digits);
  if (!masked) return '';
  return `+55 ${masked}`;
};

const formatDurationShort = (ms: number): string => {
  const totalMinutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours <= 0) return `${minutes}m`;
  if (minutes <= 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
};

const formatIntervalLabel = (value: IntervalOption): string => {
  const match = value.match(/^(\d+)m$/);
  if (!match) return value;
  const minutes = Number(match[1]);
  if (!Number.isFinite(minutes) || minutes <= 0) return value;
  if (minutes % 60 === 0) {
    const hours = minutes / 60;
    if (hours >= 1) return `${hours}h`;
  }
  return value;
};

const readCookieValue = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const needle = `${name}=`;
  const parts = (document.cookie || '').split('; ').filter(Boolean);
  for (const part of parts) {
    if (part.startsWith(needle)) {
      return decodeURIComponent(part.slice(needle.length));
    }
  }
  return null;
};

const setCookieValue = (name: string, value: string, days: number): void => {
  if (typeof document === 'undefined') return;
  const maxAge = Math.max(0, Math.floor(days * 24 * 60 * 60));
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=${WHATSAPP_COOKIE_PATH}; SameSite=Lax${secure}`;
};

const deleteCookieValue = (name: string): void => {
  if (typeof document === 'undefined') return;
  const secure = typeof window !== 'undefined' && window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${name}=; Max-Age=0; Path=${WHATSAPP_COOKIE_PATH}; SameSite=Lax${secure}`;
};

const loadWhatsAppProfileFromCookie = (): WhatsAppProfile | null => {
  if (typeof window === 'undefined') return null;
  const raw = readCookieValue(WHATSAPP_PROFILE_COOKIE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<WhatsAppProfile>;
    const numero = typeof parsed.numero === 'string' ? normalizeBrazilWhatsAppNumber(parsed.numero) : '';
    if (!numero) return null;
    const verifiedAt = typeof parsed.verifiedAt === 'number' ? parsed.verifiedAt : Date.now();
    return { numero, verifiedAt };
  } catch {
    return null;
  }
};

type StatusAlertState = {
  alertSince: number | null;
  notifiedAt: number | null;
  lastAttemptAt: number | null;
};

type SessionTokenAlertState = {
  invalidSince: number | null;
  notifiedAt: number | null;
  lastAttemptAt: number | null;
};

type StatusAlertStateMap = Record<StatusTotalOption, StatusAlertState>;

const buildDefaultStatusAlertStateMap = (): StatusAlertStateMap =>
  STATUS_TOTALS.reduce<StatusAlertStateMap>((acc, status) => {
    acc[status] = { alertSince: null, notifiedAt: null, lastAttemptAt: null };
    return acc;
  }, {} as StatusAlertStateMap);

const loadStatusAlertStateFromStorage = (): StatusAlertStateMap => {
  if (typeof window === 'undefined') return buildDefaultStatusAlertStateMap();
  try {
    const raw = window.localStorage.getItem(STATUS_ALERT_STATE_STORAGE_KEY);
    if (!raw) return buildDefaultStatusAlertStateMap();
    const parsed = JSON.parse(raw) as Partial<StatusAlertStateMap>;
    const base = buildDefaultStatusAlertStateMap();
    STATUS_TOTALS.forEach((status) => {
      const entry = parsed?.[status];
      if (!entry) return;
      base[status] = {
        alertSince: typeof entry.alertSince === 'number' ? entry.alertSince : base[status].alertSince,
        notifiedAt: typeof entry.notifiedAt === 'number' ? entry.notifiedAt : base[status].notifiedAt,
        lastAttemptAt: typeof entry.lastAttemptAt === 'number' ? entry.lastAttemptAt : base[status].lastAttemptAt,
      };
    });
    return base;
  } catch {
    return buildDefaultStatusAlertStateMap();
  }
};

const persistStatusAlertStateToStorage = (state: StatusAlertStateMap): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STATUS_ALERT_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[FaturamentosPage] Não foi possível persistir estado de alertas', error);
  }
};

const buildDefaultSessionTokenAlertState = (): SessionTokenAlertState => ({
  invalidSince: null,
  notifiedAt: null,
  lastAttemptAt: null,
});

const loadSessionTokenAlertStateFromStorage = (): SessionTokenAlertState => {
  if (typeof window === 'undefined') return buildDefaultSessionTokenAlertState();
  try {
    const raw = window.localStorage.getItem(SESSION_ALERT_STATE_STORAGE_KEY);
    if (!raw) return buildDefaultSessionTokenAlertState();
    const parsed = JSON.parse(raw) as Partial<SessionTokenAlertState>;
    return {
      invalidSince: typeof parsed.invalidSince === 'number' ? parsed.invalidSince : null,
      notifiedAt: typeof parsed.notifiedAt === 'number' ? parsed.notifiedAt : null,
      lastAttemptAt: typeof parsed.lastAttemptAt === 'number' ? parsed.lastAttemptAt : null,
    };
  } catch {
    return buildDefaultSessionTokenAlertState();
  }
};

const persistSessionTokenAlertStateToStorage = (state: SessionTokenAlertState): void => {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SESSION_ALERT_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('[FaturamentosPage] Não foi possível persistir estado do token de sessão', error);
  }
};

const buildDefaultSessionTokenAlertConfig = (): SessionTokenAlertConfig => ({
  notifyWhatsApp: false,
  notifyAfterMinutes: DEFAULT_SESSION_NOTIFY_AFTER_MINUTES,
});

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
  const notifyDefaults = {
    notifyWhatsApp: false,
    notifyAfterMinutes: DEFAULT_STATUS_NOTIFY_AFTER_MINUTES,
  };

  if (['ERRO_PREFEITURA', 'ERRO_SAP', 'ERRO_PROCESSAMENTO'].includes(status)) {
    return { alertThreshold: 0, startFrom, ...notifyDefaults };
  }
  if (['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'].includes(status)) {
    return { alertThreshold: 20, startFrom, ...notifyDefaults };
  }
  return { alertThreshold: 0, startFrom, ...notifyDefaults };
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

const clampInt = (value: number, min: number, max: number): number => {
  const coerced = Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.min(max, Math.max(min, coerced));
};

const clampIntOr = (value: unknown, min: number, max: number, fallback: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return clampInt(value, min, max);
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

const formatStatusTitle = (status: string): string => {
  const words = status
    .trim()
    .split('_')
    .filter(Boolean)
    .map((word) => {
      const lower = word.toLowerCase();
      if (lower === 'sap') return 'SAP';
      if (lower === 'nfse') return 'NFSe';
      return `${lower.charAt(0).toUpperCase()}${lower.slice(1)}`;
    });
  return words.join(' ');
};

const statusDotClassName = (status: string): string => {
  const warnStatuses: StatusOption[] = ['PENDENTE', 'DRAFT_PENDENTE', 'PROCESSANDO_INTEGRACAO'];
  if (status.startsWith('ERRO')) return 'bg-[rgba(224,32,32,0.85)]';
  if (warnStatuses.includes(status as StatusOption)) return 'bg-[rgba(144,192,48,0.80)]';
  if (status === 'ENVIADO_SAP') return 'bg-[rgba(0,112,80,0.82)]';
  return 'bg-[rgba(255,255,255,0.28)]';
};

const totalStatusClasses = (
  status: StatusTotalOption,
  adjustedValue: number | null,
  config: StatusConfig,
  animating: boolean
): string => {
  const base = 'card status-card flex flex-col items-center justify-center gap-2';
  const safeValue = typeof adjustedValue === 'number' ? adjustedValue : 0;
  const isAlert = status !== 'ENVIADO_SAP' && safeValue > config.alertThreshold;
  const loadingClasses = animating ? 'animate-pulse-soft totals-card-sheen' : '';

  if (isAlert) return `${base} status-card--danger ${loadingClasses}`;

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
  if (status === 'ENVIADO_SAP') return 'text-brand-lime';
  if (isAlert) return 'text-brand-red';
  return 'text-subtle';
};

const computeDisplayTotal = (value: number | null, config: StatusConfig): number | null => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(0, value - (config.startFrom ?? 0));
};

type TempUser = {
  username: string;
  password: string;
};

const parseTempUsers = (raw: unknown): TempUser[] => {
  if (typeof raw !== 'string') return [];
  return raw
    .split(/[,\n]/g)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const separatorIndex = entry.indexOf(':');
      if (separatorIndex <= 0) return null;
      const username = entry.slice(0, separatorIndex).trim();
      const password = entry.slice(separatorIndex + 1);
      if (!username || !password) return null;
      return { username, password };
    })
    .filter((user): user is TempUser => Boolean(user));
};

const DEFAULT_FAT_AUTH_USERS: TempUser[] = [
  { username: 'porto.ti', password: 'tIPorto@2026' },
  { username: 'admin.ti', password: 'admtIPorto@2026' },
];

const TEMP_USERS = (() => {
  const fromEnv = parseTempUsers((import.meta as any).env?.VITE_FAT_AUTH_USERS);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_FAT_AUTH_USERS;
})();

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
  const [isLoadingMore, setIsLoadingMore] = useState<boolean>(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [intervalFilter, setIntervalFilter] = useState<IntervalOption>('15m');
  const [statusFilter, setStatusFilter] = useState<StatusOption | ''>('');
  const [draftFilter, setDraftFilter] = useState<string>('');
  const [sortOption, setSortOption] = useState<SortOption>('date');
  const [visibleCount, setVisibleCount] = useState<number>(LIST_BATCH_SIZE);
  const [distinctStatusesExpanded, setDistinctStatusesExpanded] = useState<boolean>(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(false);
  const [passwordVisible, setPasswordVisible] = useState<boolean>(false);
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
	            alertThreshold: clampIntOr(conf?.alertThreshold, 0, 999, base[status].alertThreshold),
	            startFrom: clampIntOr(conf?.startFrom, 0, 9999, base[status].startFrom),
	            notifyWhatsApp:
	              typeof conf?.notifyWhatsApp === 'boolean' ? conf.notifyWhatsApp : base[status].notifyWhatsApp,
	            notifyAfterMinutes: clampIntOr(
	              conf?.notifyAfterMinutes,
	              MIN_STATUS_NOTIFY_AFTER_MINUTES,
	              MAX_STATUS_NOTIFY_AFTER_MINUTES,
	              base[status].notifyAfterMinutes
	            ),
	          };
	        });
	        return base;
	      }
	    } catch (err) {
      console.warn('[FaturamentosPage] Falha ao restaurar configurações', err);
    }
    return buildDefaultStatusConfigMap();
  });
  const [sessionTokenAlertConfig, setSessionTokenAlertConfig] = useState<SessionTokenAlertConfig>(() => {
    if (typeof window === 'undefined') return buildDefaultSessionTokenAlertConfig();
    try {
      const stored = window.localStorage.getItem(SESSION_ALERT_CONFIG_STORAGE_KEY);
      if (!stored) return buildDefaultSessionTokenAlertConfig();
      const parsed = JSON.parse(stored) as Partial<SessionTokenAlertConfig>;
      const base = buildDefaultSessionTokenAlertConfig();
      return {
        notifyWhatsApp:
          typeof parsed?.notifyWhatsApp === 'boolean' ? parsed.notifyWhatsApp : base.notifyWhatsApp,
        notifyAfterMinutes: clampIntOr(
          parsed?.notifyAfterMinutes,
          MIN_SESSION_NOTIFY_AFTER_MINUTES,
          MAX_SESSION_NOTIFY_AFTER_MINUTES,
          base.notifyAfterMinutes
        ),
      };
    } catch (err) {
      console.warn('[FaturamentosPage] Falha ao restaurar alerta do token de sessão', err);
      return buildDefaultSessionTokenAlertConfig();
    }
  });
  const [whatsAppProfile, setWhatsAppProfile] = useState<WhatsAppProfile | null>(() =>
    typeof window === 'undefined' ? null : loadWhatsAppProfileFromCookie()
  );
	  const [whatsVerification, setWhatsVerification] = useState<WhatsAppVerificationState | null>(() => {
	    if (typeof window === 'undefined') return null;
	    try {
	      const raw = window.localStorage.getItem(WHATSAPP_VERIFICATION_STORAGE_KEY);
	      if (!raw) return null;
	      const parsed = JSON.parse(raw) as Partial<WhatsAppVerificationState>;
	      const numero = typeof parsed.numero === 'string' ? normalizeBrazilWhatsAppNumber(parsed.numero) : '';
	      const code = typeof parsed.code === 'string' ? normalizeDigits(parsed.code).slice(0, 3) : '';
	      const sentAt = typeof parsed.sentAt === 'number' ? parsed.sentAt : 0;
	      const expiresAt = typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0;
	      if (!numero || !code || !sentAt || !expiresAt) return null;
	      if (expiresAt < Date.now()) return null;
	      return { numero, code, sentAt, expiresAt };
	    } catch {
	      return null;
	    }
	  });
  const [whatsNumberDraft, setWhatsNumberDraft] = useState<string>('');
  const [whatsCodeDraft, setWhatsCodeDraft] = useState<string>('');
  const [whatsChannel, setWhatsChannel] = useState<NotificationChannel>('whatsapp');
  const [whatsLoading, setWhatsLoading] = useState(false);
  const [whatsError, setWhatsError] = useState<string | null>(null);
  const [whatsSuccess, setWhatsSuccess] = useState<string | null>(null);
  const [whatsCooldownSeconds, setWhatsCooldownSeconds] = useState<number>(0);
  const whatsCooldownTimerRef = useRef<number | null>(null);

  const [showSettings, setShowSettings] = useState<boolean>(false);
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
  const [showPhpsessidVideo, setShowPhpsessidVideo] = useState<boolean>(false);
  const [topBarVisible, setTopBarVisible] = useState<boolean>(false);
  const [sessionValidateLoading, setSessionValidateLoading] = useState(false);
  const [sessionValidateResult, setSessionValidateResult] = useState<SessionValidateResult | null>(null);
  const [sessionValidateCheckedAt, setSessionValidateCheckedAt] = useState<Date | null>(null);
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
  const statusAlertStateRef = useRef<StatusAlertStateMap>(loadStatusAlertStateFromStorage());
  const sessionTokenAlertStateRef = useRef<SessionTokenAlertState>(loadSessionTokenAlertStateFromStorage());
  const restoreStatusNoticeTimeoutRef = useRef<number | null>(null);
  const [statusDefaultsRestored, setStatusDefaultsRestored] = useState(false);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loadedPages, setLoadedPages] = useState<number[]>([]);
  const [activeInterval, setActiveInterval] = useState<IntervalOption>('15m');
  const [activeStatus, setActiveStatus] = useState<StatusOption | ''>('');
  const copyTimeoutRef = useRef<number | null>(null);
  const usernameRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const loadMoreSentinelRef = useRef<HTMLDivElement | null>(null);
  const loadMoreLockRef = useRef(false);

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
    window.localStorage.setItem(SESSION_ALERT_CONFIG_STORAGE_KEY, JSON.stringify(sessionTokenAlertConfig));
  }, [sessionTokenAlertConfig]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      if (!whatsVerification) {
        window.localStorage.removeItem(WHATSAPP_VERIFICATION_STORAGE_KEY);
        return;
      }
      window.localStorage.setItem(WHATSAPP_VERIFICATION_STORAGE_KEY, JSON.stringify(whatsVerification));
    } catch (error) {
      console.warn('[FaturamentosPage] Não foi possível persistir verificação WhatsApp', error);
    }
  }, [whatsVerification]);

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
    if (!showSettings && !showNotifications && !showPhpsessidVideo) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (showPhpsessidVideo) {
          setShowPhpsessidVideo(false);
          return;
        }
        setShowSettings(false);
        setShowNotifications(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications, showPhpsessidVideo, showSettings]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!showNotifications) {
      setWhatsCooldownSeconds(0);
      if (whatsCooldownTimerRef.current) {
        window.clearInterval(whatsCooldownTimerRef.current);
        whatsCooldownTimerRef.current = null;
      }
      return;
    }

    if (!whatsVerification) {
      setWhatsCooldownSeconds(0);
      if (whatsCooldownTimerRef.current) {
        window.clearInterval(whatsCooldownTimerRef.current);
        whatsCooldownTimerRef.current = null;
      }
      return;
    }

    const updateCooldown = () => {
      const remaining = Math.ceil((whatsVerification.sentAt + WHATSAPP_CODE_COOLDOWN_MS - Date.now()) / 1000);
      setWhatsCooldownSeconds(Math.max(0, remaining));
    };

    updateCooldown();
    if (whatsCooldownTimerRef.current) {
      window.clearInterval(whatsCooldownTimerRef.current);
    }
    whatsCooldownTimerRef.current = window.setInterval(updateCooldown, 1000);

    return () => {
      if (whatsCooldownTimerRef.current) {
        window.clearInterval(whatsCooldownTimerRef.current);
        whatsCooldownTimerRef.current = null;
      }
    };
  }, [showNotifications, whatsVerification, whatsCooldownTimerRef]);

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
      const isLoadMore = !reset;

      if (!isAuthenticated) {
        return;
      }

      if (reset) {
        setItems([]);
        setLoadedPages([]);
        setTotalPages(1);
        setVisibleCount(LIST_BATCH_SIZE);
        setLoadMoreError(null);
      }

      if (isLoadMore) {
        setIsLoadingMore(true);
        setLoadMoreError(null);
      } else {
        setIsLoading(true);
        setError(null);
        setLoadMoreError(null);
      }

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
        if (isLoadMore) {
          setLoadMoreError(message);
        } else {
          setError(message);
        }
      } finally {
        if (isLoadMore) {
          setIsLoadingMore(false);
        } else {
          setIsLoading(false);
        }
      }
    },
    [activeInterval, activeStatus, isAuthenticated]
  );

	  const sendWhatsAppMessage = useCallback(async (numero: string, message: string) => {
	    const normalized = normalizeBrazilWhatsAppNumber(numero);
	    if (!normalized) {
	      throw new Error('Número de WhatsApp inválido.');
	    }

    const url = new URL(WEBHOOK_URL);
    url.searchParams.set('resource', 'notify-whats');
    url.searchParams.set('numero', normalized);
    url.searchParams.set('message', message);

    const response = await fetch(url.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
      throw new Error(`Falha ao enviar WhatsApp (status ${response.status}).`);
    }

    try {
      await response.text();
    } catch {
      // ignore
    }
  }, []);

	  const sendWhatsAppValidationCode = useCallback(async (numero: string, codigo: string) => {
	    const normalized = normalizeBrazilWhatsAppNumber(numero);
	    const normalizedCode = normalizeDigits(codigo).slice(0, 3);
	    if (!normalized) {
	      throw new Error('Número de WhatsApp inválido.');
	    }
    if (!normalizedCode || normalizedCode.length !== 3) {
      throw new Error('Código inválido.');
    }

    const url = new URL(WEBHOOK_URL);
    url.searchParams.set('resource', 'whats-validate-number');
    url.searchParams.set('numero', normalized);
    url.searchParams.set('codigo', normalizedCode);

    const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
    if (!response.ok) {
      throw new Error(`Falha ao enviar código (status ${response.status}).`);
    }

    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      try {
        data = await response.text();
      } catch {
        data = null;
      }
    }

    if (data && typeof data === 'object') {
      const asObj = data as { ok?: unknown; valido?: unknown; mensagem?: unknown; reason?: unknown };
      if (asObj.ok === false) {
        throw new Error(typeof asObj.reason === 'string' ? asObj.reason : 'Não foi possível enviar o código.');
      }
      if (asObj.valido === false) {
        throw new Error(typeof asObj.mensagem === 'string' ? asObj.mensagem : 'Não foi possível enviar o código.');
      }
    }

    return data;
  }, []);

  const maybeTriggerSessionTokenWhatsAppAlert = useCallback(
    async (result: SessionValidateResult) => {
      if (!whatsAppProfile?.numero) return;

      const now = Date.now();
      const currentState = sessionTokenAlertStateRef.current ?? buildDefaultSessionTokenAlertState();
      let nextState: SessionTokenAlertState = { ...currentState };

      const isInvalid = !result.valido;
      if (!isInvalid) {
        nextState = buildDefaultSessionTokenAlertState();
        sessionTokenAlertStateRef.current = nextState;
        persistSessionTokenAlertStateToStorage(nextState);
        return;
      }

      const justEntered = currentState.invalidSince === null;
      const invalidSince = currentState.invalidSince ?? now;
      const notifiedAt = justEntered ? null : currentState.notifiedAt;
      const lastAttemptAt = justEntered ? null : currentState.lastAttemptAt;

      const waitMinutes = clampInt(
        typeof sessionTokenAlertConfig.notifyAfterMinutes === 'number' &&
          Number.isFinite(sessionTokenAlertConfig.notifyAfterMinutes)
          ? sessionTokenAlertConfig.notifyAfterMinutes
          : DEFAULT_SESSION_NOTIFY_AFTER_MINUTES,
        MIN_SESSION_NOTIFY_AFTER_MINUTES,
        MAX_SESSION_NOTIFY_AFTER_MINUTES
      );
      const waitMs = waitMinutes * 60_000;
      const elapsedMs = now - invalidSince;

      const alreadyNotified = notifiedAt !== null;
      const throttled = lastAttemptAt !== null && now - lastAttemptAt < 60_000;
      const shouldNotify =
        Boolean(sessionTokenAlertConfig.notifyWhatsApp) && !alreadyNotified && !throttled && elapsedMs >= waitMs;

      if (!shouldNotify) {
        nextState = { invalidSince, notifiedAt, lastAttemptAt };
        sessionTokenAlertStateRef.current = nextState;
        persistSessionTokenAlertStateToStorage(nextState);
        return;
      }

      nextState = { invalidSince, notifiedAt, lastAttemptAt: now };
      sessionTokenAlertStateRef.current = nextState;
      persistSessionTokenAlertStateToStorage(nextState);

      const panelUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/faturamentos`
          : 'notify.autevia.com.br/faturamentos';

      const messageLines = [
        'Monitor NFSe Porto Itapoá',
        'Alerta de token de sessão',
        '',
        `• Token inválido há ${formatDurationShort(elapsedMs)} (limiar ${waitMinutes}m)`,
        ...(result.fileId ? [`• fileId: ${result.fileId}`] : []),
        ...(result.mensagem ? [`• ${result.mensagem.slice(0, 180)}`] : []),
        '',
        `Painel: ${panelUrl}`,
      ];

      try {
        await sendWhatsAppMessage(whatsAppProfile.numero, messageLines.join('\n'));
        const sentAt = Date.now();
        nextState = { ...nextState, notifiedAt: sentAt };
        sessionTokenAlertStateRef.current = nextState;
        persistSessionTokenAlertStateToStorage(nextState);
      } catch (error) {
        console.warn('[FaturamentosPage] Falha ao enviar alerta do token de sessão', error);
      }
    },
    [sendWhatsAppMessage, sessionTokenAlertConfig.notifyAfterMinutes, sessionTokenAlertConfig.notifyWhatsApp, whatsAppProfile?.numero]
  );

  const maybeTriggerWhatsAppAlerts = useCallback(
    async (nextTotals: StatusTotalsMap) => {
      if (!whatsAppProfile?.numero) return;

      const now = Date.now();
      const currentState = statusAlertStateRef.current ?? buildDefaultStatusAlertStateMap();
      const nextState: StatusAlertStateMap = { ...currentState };
      const triggers: Array<{
        status: StatusTotalOption;
        displayed: number;
        threshold: number;
        elapsedMs: number;
      }> = [];

      STATUS_TOTALS.forEach((status) => {
        const config = statusConfig[status] ?? defaultStatusConfig(status);
        const displayed = computeDisplayTotal(nextTotals[status], config);
        const isAlert = displayed !== null && displayed > config.alertThreshold;
        const prev = currentState[status] ?? { alertSince: null, notifiedAt: null, lastAttemptAt: null };

        if (!isAlert) {
          nextState[status] = { alertSince: null, notifiedAt: null, lastAttemptAt: null };
          return;
        }

        const justEntered = prev.alertSince === null;
        const alertSince = prev.alertSince ?? now;
        const notifiedAt = justEntered ? null : prev.notifiedAt;
        const lastAttemptAt = justEntered ? null : prev.lastAttemptAt;

        const waitMinutes = clampInt(
          typeof config.notifyAfterMinutes === 'number' && Number.isFinite(config.notifyAfterMinutes)
            ? config.notifyAfterMinutes
            : DEFAULT_STATUS_NOTIFY_AFTER_MINUTES,
          MIN_STATUS_NOTIFY_AFTER_MINUTES,
          MAX_STATUS_NOTIFY_AFTER_MINUTES
        );
        const waitMs = waitMinutes * 60_000;
        const elapsedMs = now - alertSince;

        const alreadyNotified = notifiedAt !== null;
        const throttled = lastAttemptAt !== null && now - lastAttemptAt < 60_000;
        const shouldNotify =
          Boolean(config.notifyWhatsApp) && !alreadyNotified && !throttled && elapsedMs >= waitMs;

        if (shouldNotify) {
          triggers.push({
            status,
            displayed: typeof displayed === 'number' ? displayed : 0,
            threshold: config.alertThreshold,
            elapsedMs,
          });
          nextState[status] = { alertSince, notifiedAt, lastAttemptAt: now };
          return;
        }

        nextState[status] = { alertSince, notifiedAt, lastAttemptAt };
      });

      statusAlertStateRef.current = nextState;
      persistStatusAlertStateToStorage(nextState);

      if (triggers.length === 0) return;

      const panelUrl =
        typeof window !== 'undefined'
          ? `${window.location.origin}/faturamentos`
          : 'notify.autevia.com.br/faturamentos';

      const messageLines = [
        'Monitor NFSe Porto Itapoá',
        'Alerta de status',
        '',
        ...triggers.map(
          (item) =>
            `• ${item.status.replace(/_/g, ' ')}: ${formatInt(item.displayed)} (limiar ${
              item.threshold
            }) há ${formatDurationShort(item.elapsedMs)}`
        ),
        '',
        `Painel: ${panelUrl}`,
      ];

      try {
        await sendWhatsAppMessage(whatsAppProfile.numero, messageLines.join('\n'));
        const sentAt = Date.now();
        triggers.forEach((item) => {
          const prev = nextState[item.status] ?? { alertSince: null, notifiedAt: null, lastAttemptAt: null };
          nextState[item.status] = { ...prev, notifiedAt: sentAt };
        });
        statusAlertStateRef.current = nextState;
        persistStatusAlertStateToStorage(nextState);
      } catch (error) {
        console.warn('[FaturamentosPage] Falha ao enviar alerta WhatsApp', error);
      }
    },
    [sendWhatsAppMessage, statusConfig, whatsAppProfile?.numero]
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
      void maybeTriggerWhatsAppAlerts(nextTotals);
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
  }, [isAuthenticated, maybeTriggerWhatsAppAlerts]);

  const validateSession = useCallback(
    async (options?: { silent?: boolean }) => {
      if (!isAuthenticated) return;
      setSessionValidateLoading(true);
      if (!options?.silent) {
        setSessionValidateResult(null);
      }
      try {
        const normalize = (payload: unknown): SessionValidateResult => {
          if (typeof payload === 'boolean') return { valido: payload };
          if (payload && typeof payload === 'object') {
            const cast = payload as {
              valido?: unknown;
              ok?: unknown;
              fileId?: unknown;
              mensagem?: unknown;
              message?: unknown;
            };
            const valido =
              typeof cast.valido === 'boolean'
                ? cast.valido
                : typeof cast.ok === 'boolean'
                ? cast.ok
                : false;
            const fileId = typeof cast.fileId === 'string' ? cast.fileId : undefined;
            const mensagem =
              typeof cast.mensagem === 'string'
                ? cast.mensagem
                : typeof cast.message === 'string'
                ? cast.message
                : undefined;
            const result: SessionValidateResult = { valido };
            if (fileId) result.fileId = fileId;
            if (mensagem) result.mensagem = mensagem;
            return result;
          }
          return { valido: false };
        };

        const url = new URL(WEBHOOK_URL);
        url.searchParams.set('resource', 'validar-sessao');
        const response = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
        if (!response.ok) {
          throw new Error(`Falha ao validar sessão (status ${response.status})`);
        }
        const data = await response.json();
        const normalized = normalize(data);
        setSessionValidateResult(normalized);
        void maybeTriggerSessionTokenWhatsAppAlert(normalized);
      } catch (err) {
        const fallback: SessionValidateResult = {
          valido: false,
          mensagem: err instanceof Error ? err.message : 'Erro ao validar',
        };
        setSessionValidateResult(fallback);
        void maybeTriggerSessionTokenWhatsAppAlert(fallback);
      } finally {
        setSessionValidateCheckedAt(new Date());
        setSessionValidateLoading(false);
      }
    },
    [isAuthenticated, maybeTriggerSessionTokenWhatsAppAlert]
  );

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

  useEffect(() => {
    if (!isAuthenticated) return;
    void validateSession({ silent: true });
    const intervalMs = sessionTokenAlertConfig.notifyWhatsApp
      ? SESSION_VALIDATE_ALERT_INTERVAL_MS
      : SESSION_VALIDATE_DEFAULT_INTERVAL_MS;
    const id = window.setInterval(() => {
      void validateSession({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [isAuthenticated, sessionTokenAlertConfig.notifyWhatsApp, validateSession]);

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

  const visibleItems = useMemo(
    () => sortedItems.slice(0, Math.max(LIST_BATCH_SIZE, visibleCount)),
    [sortedItems, visibleCount]
  );

  const visibleNowCount = useMemo(
    () => Math.min(sortedItems.length, visibleItems.length),
    [sortedItems.length, visibleItems.length]
  );

  const visibleNowPct = useMemo(() => {
    if (sortedItems.length <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((visibleNowCount / sortedItems.length) * 100)));
  }, [sortedItems.length, visibleNowCount]);

  const summary = useMemo(() => {
    if (!filteredItems.length) {
      return {
        totalProcessos: 0,
        ultimaEmissao: null as string | null,
        emitidas: 0,
        statusUnicos: 0,
        statusCounts: {} as Record<string, number>,
      };
    }

    let ultimaEmissao: Date | null = null;
    let emitidas = 0;
    const statusSet = new Set<string>();
    const statusCounts: Record<string, number> = {};

    filteredItems.forEach((item) => {
      statusSet.add(item.status);
      statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;

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
      statusCounts,
    };
  }, [filteredItems]);

  const emitidasPct = useMemo(() => {
    if (summary.totalProcessos <= 0) return 0;
    return Math.min(100, Math.max(0, Math.round((summary.emitidas / summary.totalProcessos) * 100)));
  }, [summary.emitidas, summary.totalProcessos]);

  const distinctStatusList = useMemo(() => {
    const entries = Object.entries(summary.statusCounts)
      .filter(([, count]) => typeof count === 'number' && count > 0)
      .map(([status, count]) => ({ status, count: count as number }));

    const knownOrder = new Map<string, number>();
    STATUS_OPTIONS.forEach((status, index) => knownOrder.set(status, index));

    entries.sort((a, b) => {
      if (b.count !== a.count) return b.count - a.count;
      const aKnown = knownOrder.get(a.status) ?? Number.MAX_SAFE_INTEGER;
      const bKnown = knownOrder.get(b.status) ?? Number.MAX_SAFE_INTEGER;
      if (aKnown !== bKnown) return aKnown - bKnown;
      return a.status.localeCompare(b.status);
    });

    return entries;
  }, [summary.statusCounts]);

  const distinctStatusHasMore = distinctStatusList.length > 4;
  const distinctStatusVisible = useMemo(
    () => (distinctStatusesExpanded ? distinctStatusList : distinctStatusList.slice(0, 4)),
    [distinctStatusesExpanded, distinctStatusList]
  );

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

  type NumericStatusConfigField = 'alertThreshold' | 'startFrom' | 'notifyAfterMinutes';

  const handleStatusConfigChange = (
    status: StatusTotalOption,
    field: NumericStatusConfigField,
    value: number
  ) => {
    setStatusConfig((prev) => {
      const current = prev[status] ?? defaultStatusConfig(status);
      if (!Number.isFinite(value)) {
        return prev;
      }

      const nextValue = (() => {
        if (field === 'alertThreshold') return clampInt(value, 0, 999);
        if (field === 'startFrom') return clampInt(value, 0, 9999);
        return clampInt(value, MIN_STATUS_NOTIFY_AFTER_MINUTES, MAX_STATUS_NOTIFY_AFTER_MINUTES);
      })();
      return {
        ...prev,
        [status]: {
          ...current,
          [field]: nextValue,
        },
      };
    });
  };

  const handleStatusNotifyWhatsAppChange = (status: StatusTotalOption, next: boolean) => {
    setStatusConfig((prev) => ({
      ...prev,
      [status]: {
        ...prev[status],
        notifyWhatsApp: next,
        notifyAfterMinutes:
          clampInt(
            typeof prev[status]?.notifyAfterMinutes === 'number'
              ? prev[status].notifyAfterMinutes
              : DEFAULT_STATUS_NOTIFY_AFTER_MINUTES,
            MIN_STATUS_NOTIFY_AFTER_MINUTES,
            MAX_STATUS_NOTIFY_AFTER_MINUTES
          ),
      },
    }));
  };

  const handleSessionTokenNotifyWhatsAppChange = (next: boolean) => {
    setSessionTokenAlertConfig((prev) => ({
      ...prev,
      notifyWhatsApp: next,
      notifyAfterMinutes: clampInt(
        typeof prev?.notifyAfterMinutes === 'number' ? prev.notifyAfterMinutes : DEFAULT_SESSION_NOTIFY_AFTER_MINUTES,
        MIN_SESSION_NOTIFY_AFTER_MINUTES,
        MAX_SESSION_NOTIFY_AFTER_MINUTES
      ),
    }));
  };

  const handleSessionTokenNotifyAfterMinutesChange = (value: number) => {
    if (!Number.isFinite(value)) return;
    setSessionTokenAlertConfig((prev) => ({
      ...prev,
      notifyAfterMinutes: clampInt(value, MIN_SESSION_NOTIFY_AFTER_MINUTES, MAX_SESSION_NOTIFY_AFTER_MINUTES),
    }));
  };

  const handleRestoreStatusDefaults = () => {
    const defaults = buildDefaultStatusConfigMap();
    setStatusConfig(defaults);
    setStatusDefaultsRestored(true);
    if (restoreStatusNoticeTimeoutRef.current) {
      window.clearTimeout(restoreStatusNoticeTimeoutRef.current);
      restoreStatusNoticeTimeoutRef.current = null;
    }
    restoreStatusNoticeTimeoutRef.current = window.setTimeout(() => {
      setStatusDefaultsRestored(false);
      restoreStatusNoticeTimeoutRef.current = null;
    }, 2200);
  };

  const handleOpenSettings = () => {
    setShowNotifications(false);
    setShowSettings(true);
  };

  const handleOpenNotifications = () => {
    setShowSettings(false);
    setShowNotifications(true);
    setWhatsChannel('whatsapp');
    setWhatsError(null);
    setWhatsSuccess(null);
    setWhatsCodeDraft('');
    setWhatsNumberDraft((prev) => formatBrazilPhoneMask(prev || whatsVerification?.numero || whatsAppProfile?.numero || ''));
  };

  const handleCloseModals = () => {
    setShowSettings(false);
    setShowNotifications(false);
    setShowPhpsessidVideo(false);
  };

  const handleSendWhatsAppCode = async () => {
    if (whatsLoading) return;
    if (whatsCooldownSeconds > 0) return;

    setWhatsError(null);
    setWhatsSuccess(null);

    const numero = normalizeBrazilWhatsAppNumber(whatsNumberDraft);
    if (!numero) {
      setWhatsError('Informe um número completo com DDD + número (DDI 55 é automático). Ex.: (47)9 9905-4093');
      return;
    }

    setWhatsLoading(true);
    const code = String(100 + Math.floor(Math.random() * 900));
    const now = Date.now();

    const verification: WhatsAppVerificationState = {
      numero,
      code,
      sentAt: now,
      expiresAt: now + WHATSAPP_CODE_TTL_MS,
    };

    try {
      await sendWhatsAppValidationCode(numero, code);
      setWhatsVerification(verification);
      setWhatsCodeDraft('');
      setWhatsSuccess('Código enviado. Verifique seu WhatsApp e confirme abaixo.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar código via WhatsApp.';
      setWhatsError(message);
    } finally {
      setWhatsLoading(false);
    }
  };

  const handleVerifyWhatsAppCode = () => {
    setWhatsError(null);
    setWhatsSuccess(null);

    if (!whatsVerification) {
      setWhatsError('Solicite um código antes de validar.');
      return;
    }

    if (whatsVerification.expiresAt < Date.now()) {
      setWhatsError('Seu código expirou. Solicite um novo código.');
      setWhatsVerification(null);
      setWhatsCodeDraft('');
      return;
    }

    const candidate = normalizeDigits(whatsCodeDraft).slice(0, 3);
    if (candidate.length !== 3) {
      setWhatsError('Digite os 3 dígitos do código.');
      return;
    }

    if (candidate !== whatsVerification.code) {
      setWhatsError('Código inválido: ele não bate com o código enviado. Confira e tente novamente, ou reenvie o código.');
      setWhatsCodeDraft('');
      return;
    }

    const profile: WhatsAppProfile = {
      numero: whatsVerification.numero,
      verifiedAt: Date.now(),
    };

    setCookieValue(WHATSAPP_PROFILE_COOKIE_KEY, JSON.stringify(profile), WHATSAPP_PROFILE_COOKIE_DAYS);
    setWhatsAppProfile(profile);
    setWhatsVerification(null);
    setWhatsCodeDraft('');
    setWhatsSuccess('WhatsApp confirmado e salvo neste navegador.');
  };

  const handleEditWhatsAppPendingNumber = () => {
    setWhatsVerification(null);
    setWhatsCodeDraft('');
    setWhatsError(null);
    setWhatsSuccess(null);
  };

  const handleClearWhatsAppProfile = () => {
    deleteCookieValue(WHATSAPP_PROFILE_COOKIE_KEY);
    setWhatsAppProfile(null);
    setWhatsVerification(null);
    setWhatsNumberDraft('');
    setWhatsCodeDraft('');
    setWhatsError(null);
    setWhatsSuccess('Configuração de WhatsApp removida.');
  };

	  const handleEditWhatsAppProfile = () => {
	    const current = whatsAppProfile?.numero ?? '';
	    deleteCookieValue(WHATSAPP_PROFILE_COOKIE_KEY);
	    setWhatsAppProfile(null);
	    setWhatsVerification(null);
	    setWhatsNumberDraft(formatBrazilPhoneMask(current));
	    setWhatsCodeDraft('');
	    setWhatsError(null);
	    setWhatsSuccess(null);
	  };

  const handleSendWhatsAppTest = async () => {
    if (whatsLoading) return;
    if (!whatsAppProfile?.numero) return;
    setWhatsError(null);
    setWhatsSuccess(null);
    setWhatsLoading(true);
    try {
      await sendWhatsAppMessage(whatsAppProfile.numero, 'Monitor NFSe Porto Itapoá\n\nMensagem de teste enviada com sucesso.');
      setWhatsSuccess('Mensagem de teste enviada.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Falha ao enviar mensagem de teste.';
      setWhatsError(message);
    } finally {
      setWhatsLoading(false);
    }
  };

  const handleAutoRefreshSecondsChange = (value: number) => {
    setAutoRefreshSeconds(clampRefreshSeconds(value));
  };

  const toggleAutoRefresh = () => {
    setAutoRefreshEnabled((prev) => !prev);
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

  const storeBrowserCredential = async (form: HTMLFormElement) => {
    if (typeof window === 'undefined') return;
    try {
      const nav = navigator as any;
      const win = window as any;
      if (!nav?.credentials?.store) return;
      if (typeof win.PasswordCredential !== 'function') return;
      const credential = new win.PasswordCredential(form);
      await nav.credentials.store(credential);
    } catch (error) {
      console.warn('[FaturamentosPage] Não foi possível salvar credenciais no navegador', error);
    }
  };

  const handleAuthSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (authLoading) return;

    if (TEMP_USERS.length === 0) {
      setAuthError('Login indisponível. Credenciais não configuradas.');
      return;
    }

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

      void storeBrowserCredential(event.currentTarget);

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

  const handleLoadMore = useCallback(async () => {
    if (!isAuthenticated) return;
    if (error) return;
    if (isLoading || isLoadingMore) return;
    if (loadMoreLockRef.current) return;
    if (sortedItems.length === 0) return;

    const currentVisible = Math.max(LIST_BATCH_SIZE, visibleCount);
    const hasMoreToShow = currentVisible < sortedItems.length;
    const hasMorePages = loadedPages.length < totalPages;

    if (!hasMoreToShow && !hasMorePages) {
      return;
    }

    loadMoreLockRef.current = true;
    setLoadMoreError(null);

    try {
      const nextVisible = currentVisible + LIST_BATCH_SIZE;
      setVisibleCount(nextVisible);

      if (sortedItems.length >= nextVisible || !hasMorePages) {
        return;
      }

      const loadedSet = new Set<number>(loadedPages);
      let nextPage: number | null = null;
      for (let i = 0; i < totalPages; i += 1) {
        if (!loadedSet.has(i)) {
          nextPage = i;
          break;
        }
      }

      if (nextPage !== null) {
        await fetchData({ page: nextPage, reset: false });
      }
    } finally {
      loadMoreLockRef.current = false;
    }
  }, [
    error,
    fetchData,
    isAuthenticated,
    isLoading,
    isLoadingMore,
    loadedPages,
    totalPages,
    visibleCount,
    sortedItems.length,
  ]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (typeof window === 'undefined') return;
    if (typeof IntersectionObserver === 'undefined') return;
    if (error) return;

    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel) return;
    if (sortedItems.length === 0) return;

    const currentVisible = Math.max(LIST_BATCH_SIZE, visibleCount);
    const hasMoreToShow = currentVisible < sortedItems.length;
    const hasMorePages = loadedPages.length < totalPages;
    const canLoadMore = hasMoreToShow || hasMorePages;
    if (!canLoadMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          void handleLoadMore();
        }
      },
      { rootMargin: '260px 0px' }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [error, handleLoadMore, isAuthenticated, loadedPages.length, sortedItems.length, totalPages, visibleCount]);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (!draftFilter.trim()) return;
    if (filteredItems.length > 0) return;
    if (isLoading || isLoadingMore) return;
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
  }, [draftFilter, filteredItems.length, isLoading, isLoadingMore, loadedPages, totalPages, fetchData, isAuthenticated]);

  useEffect(
    () => () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      if (restoreStatusNoticeTimeoutRef.current) {
        window.clearTimeout(restoreStatusNoticeTimeoutRef.current);
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
		                <div className="relative">
		                  <input
		                    ref={passwordRef}
		                    id="password"
		                    name="password"
		                    type={passwordVisible ? 'text' : 'password'}
		                    autoComplete="current-password"
		                    required
		                    className="input-field input-field-rect pr-12 text-sm"
		                    placeholder="Digite a senha"
		                  />
		                  <button
		                    type="button"
		                    className="icon-btn absolute right-2 top-1/2 -translate-y-1/2"
		                    onClick={() => setPasswordVisible((prev) => !prev)}
		                    aria-label={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
		                    title={passwordVisible ? 'Ocultar senha' : 'Mostrar senha'}
		                  >
		                    {passwordVisible ? (
		                      <EyeOffIcon className="h-4 w-4" />
		                    ) : (
		                      <EyeIcon className="h-4 w-4" />
		                    )}
		                  </button>
		                </div>
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
                  onClick={handleOpenSettings}
                  className="icon-btn"
                  aria-label="Abrir configurações"
                >
                  <GearIcon className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={handleOpenNotifications}
                  className="icon-btn"
                  aria-label="Abrir notificações"
                >
                  <BellIcon className="h-4 w-4" />
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
            <div className="flex flex-col gap-2 self-start sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={handleOpenNotifications}
                className="btn btn-ghost inline-flex items-center gap-2 text-sm"
              >
                <BellIcon className="h-4 w-4" />
                Notificações
              </button>
              <button
                type="button"
                onClick={handleOpenSettings}
                className="btn btn-ghost inline-flex items-center gap-2 text-sm"
              >
                <GearIcon className="h-4 w-4" />
                Configurações
              </button>
            </div>
          </div>

          <section className="surface p-4">
            {totalsError && (
              <div className="mb-4 rounded-2xl bg-[rgba(224,32,32,0.12)] px-4 py-3 text-xs text-brand-red shadow-[inset_0_0_0_1px_rgba(224,32,32,0.22)]">
                {totalsError}
              </div>
            )}

            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 px-1">
              <button
                type="button"
                onClick={handleOpenSettings}
                className={`badge transition hover:brightness-110 ${
                  sessionValidateLoading
                    ? 'badge-soft'
                    : sessionValidateResult?.valido
                    ? 'badge-ok'
                    : sessionValidateResult
                    ? 'badge-danger'
                    : 'badge-soft'
                }`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${
                    sessionValidateLoading
                      ? 'bg-[rgba(255,255,255,0.35)]'
                      : sessionValidateResult?.valido
                      ? 'bg-[rgba(0,112,80,0.85)]'
                      : sessionValidateResult
                      ? 'bg-[rgba(224,32,32,0.85)]'
                      : 'bg-[rgba(255,255,255,0.35)]'
                  }`}
                  aria-hidden="true"
                />
                {sessionValidateLoading
                  ? 'Verificando token...'
                  : sessionValidateResult
                  ? sessionValidateResult.valido
                    ? 'Token válido'
                    : 'Token inválido'
                  : 'Token não verificado'}
              </button>

              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                Última verificação: <span className="text-white">{formatTimeShort(sessionValidateCheckedAt)}</span>
              </p>
            </div>

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
	                      const isAlert = status !== 'ENVIADO_SAP' && displayed !== null && displayed > config.alertThreshold;

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
	                const isAlert = status !== 'ENVIADO_SAP' && displayed !== null && displayed > config.alertThreshold;

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
                        {formatIntervalLabel(option)}
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

      <main className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-6">
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="card card-ring kpi-card flex min-h-[172px] flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Processos</p>
              <span className="badge badge-soft text-[10px] tracking-[0.16em]">
                Exibindo {formatInt(visibleNowCount)}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-4xl font-semibold tabular-nums text-white">{formatInt(summary.totalProcessos)}</p>
              <p className="mt-1 text-xs text-muted">Carregados para os filtros</p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                <span>Progresso</span>
                <span className="tabular-nums text-white">
                  {summary.totalProcessos > 0
                    ? `${formatInt(visibleNowCount)} / ${formatInt(summary.totalProcessos)}`
                    : '—'}
                </span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full bg-[rgba(0,112,80,0.70)]"
                  style={{ width: `${visibleNowPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {formatInt(loadedPages.length)} / {formatInt(totalPages)} páginas consultadas
              </p>
            </div>
          </div>

          <div className="card card-ring kpi-card flex min-h-[172px] flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Status distintos</p>
              <span className="badge badge-soft text-[10px] tracking-[0.16em]">
                {formatInt(summary.statusUnicos)}
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {distinctStatusList.length === 0 ? (
                <p className="text-sm text-muted">—</p>
              ) : (
                distinctStatusVisible.map((entry) => (
                  <div
                    key={entry.status}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-[rgba(255,255,255,0.03)] px-3 py-2"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${statusDotClassName(entry.status)}`} />
                      <span className="truncate text-sm font-semibold text-white">{formatStatusTitle(entry.status)}</span>
                    </div>
                    <span className="tabular-nums text-sm font-semibold text-white">{formatInt(entry.count)}</span>
                  </div>
                ))
              )}
            </div>
            {distinctStatusHasMore && (
              <button
                type="button"
                onClick={() => setDistinctStatusesExpanded((prev) => !prev)}
                className="btn btn-ghost mt-2 w-fit text-xs"
              >
                {distinctStatusesExpanded ? 'Ver menos' : `Ver todos (${formatInt(distinctStatusList.length)})`}
              </button>
            )}
          </div>

          <div className="card card-ring kpi-card flex min-h-[172px] flex-col justify-between">
            <div className="flex items-start justify-between gap-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">Notas emitidas</p>
              <span className="badge badge-soft text-[10px] tracking-[0.16em]">
                {summary.totalProcessos > 0 ? `${formatInt(emitidasPct)}%` : '—'}
              </span>
            </div>

            <div className="mt-3">
              <p className="text-4xl font-semibold tabular-nums text-white">{formatInt(summary.emitidas)}</p>
              <p className="mt-1 text-xs text-muted">Com data NFSe disponível</p>
            </div>

            <div className="mt-4">
              <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-[0.22em] text-subtle">
                <span>Última emissão</span>
                <span className="text-white">{summary.ultimaEmissao ?? '—'}</span>
              </div>
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                <div
                  className="h-full rounded-full bg-[rgba(144,192,48,0.75)]"
                  style={{ width: `${emitidasPct}%` }}
                />
              </div>
              <p className="mt-2 text-xs text-muted">
                {summary.totalProcessos > 0
                  ? `${formatInt(summary.emitidas)} de ${formatInt(summary.totalProcessos)} processos`
                  : '—'}
              </p>
            </div>
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
            {visibleItems.map((item) => {
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

            <div ref={loadMoreSentinelRef} className="h-px w-full" aria-hidden="true" />

            {!error && items.length > 0 && filteredItems.length > 0 && (
              <div className="flex flex-col items-center justify-center gap-3 py-2 text-center">
                {loadMoreError ? (
                  <div className="card card-ring w-full bg-[rgba(224,32,32,0.08)] px-4 py-3 text-sm text-brand-red">
                    <p className="font-semibold">Falha ao carregar mais processos.</p>
                    <p className="mt-1 text-xs text-muted">{loadMoreError}</p>
                    <button type="button" onClick={() => void handleLoadMore()} className="btn btn-ghost mt-3 text-sm">
                      Tentar novamente
                    </button>
                  </div>
                ) : isLoadingMore ? (
                  <div className="text-xs text-muted">Carregando mais 10...</div>
                ) : Math.max(LIST_BATCH_SIZE, visibleCount) < sortedItems.length || loadedPages.length < totalPages ? (
                  <button type="button" onClick={() => void handleLoadMore()} className="btn btn-ghost text-sm">
                    Carregar mais
                  </button>
                ) : (
                  <div className="text-xs text-subtle">Fim da lista.</div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40">
        <div className="bottombar-glass bottombar-safe">
          <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
            <div className="flex min-h-[3.25rem] flex-col items-start justify-between gap-2 py-2 text-xs text-subtle sm:flex-row sm:items-center">
              <p className="min-w-0 truncate">
                Última atualização:{' '}
                <span className="text-white">
                  {lastUpdated ? formatDateTime(lastUpdated.toISOString()) : '—'}
                </span>
              </p>
              <p className="shrink-0 text-muted">
                {error ? (
                  <span className="text-brand-red">Falha ao carregar dados</span>
                ) : isLoading ? (
                  'Atualizando...'
                ) : isLoadingMore ? (
                  'Carregando mais...'
                ) : (
                  <>
                    Intervalo <span className="text-white">{formatIntervalLabel(activeInterval)}</span> · Status{' '}
                    <span className="text-white">
                      {activeStatus ? formatStatusTitle(activeStatus) : 'Todos'}
                    </span>
                    {draftFilter.trim() ? (
                      <>
                        {' '}
                        · Draft <span className="text-white">{draftFilter.trim()}</span>
                      </>
                    ) : null}
                  </>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showNotifications && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={handleCloseModals}
        >
          <div
            className="surface surface-sheet flex w-full max-h-[92vh] flex-col overflow-hidden sm:mx-4 md:max-w-5xl lg:max-w-6xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(5,7,20,0.35)] px-4 pb-4 pt-4 backdrop-blur sm:px-6 sm:pt-6">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[rgba(255,255,255,0.14)] md:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Painel</p>
                  <h2 className="text-2xl font-semibold text-white">Notificações</h2>
                </div>
                <button
                  type="button"
                  onClick={handleCloseModals}
                  className="btn btn-ghost text-sm"
                >
                  Fechar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-5 sm:px-6">
              <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                <section className="card card-ring space-y-4 p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Canais</p>
                    <p className="text-sm text-muted">Escolha como receber alertas.</p>
                  </div>

                  <div className="space-y-3">
                    <button
                      type="button"
                      disabled
                      className="card card-ring w-full cursor-not-allowed p-4 text-left opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">E-mail</p>
                          <p className="mt-1 text-xs text-muted">Em desenvolvimento</p>
                        </div>
                        <span className="badge badge-soft">Bloqueado</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      disabled
                      className="card card-ring w-full cursor-not-allowed p-4 text-left opacity-60"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">Push notification (somente smartphone)</p>
                          <p className="mt-1 text-xs text-muted">Em desenvolvimento</p>
                        </div>
                        <span className="badge badge-soft">Bloqueado</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setWhatsChannel('whatsapp')}
                      className={`card card-ring w-full p-4 text-left transition ${
                        whatsChannel === 'whatsapp' ? 'card-ring--active' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">WhatsApp</p>
                          <p className="mt-1 text-xs text-muted">Alertas de status no seu número validado.</p>
                        </div>
                        <span className="badge badge-soft">Ativo</span>
                      </div>
                    </button>
                  </div>

                  <div className="card card-ring bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-muted">
                    Dica: para disparar alertas automaticamente, mantenha o painel aberto com <strong>Auto refresh</strong>{' '}
                    ligado.
                  </div>
                </section>

                <section className="card card-ring space-y-4 p-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">WhatsApp</p>
                    <p className="text-sm text-muted">Valide seu número para receber alertas.</p>
                  </div>

                  {whatsError && (
                    <div className="card card-ring bg-[rgba(224,32,32,0.10)] px-4 py-3 text-xs text-white">
                      <p className="font-semibold text-brand-red">Erro</p>
                      <p className="mt-1 text-muted">{whatsError}</p>
                    </div>
                  )}

                  {whatsSuccess && (
                    <div className="card card-ring bg-[rgba(0,112,80,0.10)] px-4 py-3 text-xs text-white">
                      <p className="font-semibold text-brand-lime">Ok</p>
                      <p className="mt-1 text-muted">{whatsSuccess}</p>
                    </div>
                  )}

                  {whatsAppProfile?.numero ? (
                    <div className="space-y-3">
                      <div className="card card-ring px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
                          Número validado
                        </p>
                        <p className="mt-2 text-lg font-semibold text-white">
                          {formatBrazilWhatsAppDisplay(whatsAppProfile.numero)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Validado em {formatDateTime(new Date(whatsAppProfile.verifiedAt).toISOString(), '—')}
                        </p>
                      </div>

                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <button
                          type="button"
                          onClick={handleSendWhatsAppTest}
                          disabled={whatsLoading}
                          className="btn btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {whatsLoading ? 'Enviando...' : 'Enviar teste'}
                        </button>
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={handleEditWhatsAppProfile}
                            className="btn btn-ghost text-sm"
                          >
                            Alterar
                          </button>
                          <button
                            type="button"
                            onClick={handleClearWhatsAppProfile}
                            className="btn btn-ghost text-sm"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="card card-ring space-y-3 p-4">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
                          1) Enviar código
                        </p>

                        <label className="space-y-1 text-xs text-muted">
                          <span>Número do WhatsApp (DDD + número)</span>
                          <input
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder="(47)9 9905-4093"
                            value={whatsNumberDraft}
                            onChange={(e) => setWhatsNumberDraft(formatBrazilPhoneMask(e.target.value))}
                            disabled={whatsLoading || Boolean(whatsVerification)}
                            className="input-field input-field-rect text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          />
                        </label>

                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            onClick={handleSendWhatsAppCode}
                            disabled={whatsLoading || whatsCooldownSeconds > 0}
                            className="btn btn-primary text-sm disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {whatsLoading
                              ? 'Enviando...'
                              : whatsCooldownSeconds > 0
                              ? `Reenviar em ${whatsCooldownSeconds}s`
                              : 'Enviar código'}
                          </button>

                          {whatsVerification && (
                            <button
                              type="button"
                              onClick={handleEditWhatsAppPendingNumber}
                              disabled={whatsLoading}
                              className="btn btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Alterar número
                            </button>
                          )}
                        </div>
                      </div>

                      {whatsVerification && (
                        <div className="card card-ring space-y-3 p-4">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
                            2) Confirmar código
                          </p>
                          <p className="text-xs text-muted">
                            Digite os 3 dígitos enviados para{' '}
                            <span className="text-white">{formatBrazilWhatsAppDisplay(whatsVerification.numero)}</span>.
                          </p>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <input
                              type="text"
                              inputMode="numeric"
                              pattern="[0-9]*"
                              placeholder="123"
                              value={whatsCodeDraft}
                              onChange={(e) => setWhatsCodeDraft(normalizeDigits(e.target.value).slice(0, 3))}
                              className="input-field input-field-rect text-sm sm:max-w-[120px]"
                            />
                            <button
                              type="button"
                              onClick={handleVerifyWhatsAppCode}
                              className="btn btn-ghost text-sm"
                            >
                              Validar
                            </button>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                              <button
                                type="button"
                                onClick={handleSendWhatsAppCode}
                                disabled={whatsLoading || whatsCooldownSeconds > 0}
                                className="btn btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {whatsCooldownSeconds > 0 ? `Reenviar em ${whatsCooldownSeconds}s` : 'Reenviar código'}
                              </button>
                              <button
                                type="button"
                                onClick={handleEditWhatsAppPendingNumber}
                                disabled={whatsLoading}
                                className="btn btn-ghost text-sm disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                Alterar número
                              </button>
                            </div>

                            <span className="text-[11px] text-subtle">
                              Expira em {formatDurationShort(Math.max(0, whatsVerification.expiresAt - Date.now()))}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={handleCloseModals}
        >
          <div
            className="surface surface-sheet flex w-full max-h-[92vh] flex-col overflow-hidden sm:mx-4 md:max-w-5xl lg:max-w-6xl"
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
                  onClick={handleCloseModals}
                  className="btn btn-ghost text-sm"
                >
                  Fechar
                </button>
              </div>
	            </div>
	
	            <div className="flex-1 overflow-y-auto px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-5 sm:px-6">
	              <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(320px,380px)] lg:items-stretch">
	                <section className="card card-ring space-y-4 p-4">
	                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
	                    <div>
	                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
	                        Alertas por status
	                      </p>
	                      <p className="text-sm text-muted">
	                        Defina limiar, início, notificações e tempo em alerta (5–360 min).
	                      </p>
	                    </div>
	                    <div className="flex items-center gap-3 sm:justify-end">
	                      {statusDefaultsRestored && (
	                        <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-brand-lime">
	                          Padrões restaurados
	                        </span>
	                      )}
	                      <button
	                        type="button"
	                        onClick={handleRestoreStatusDefaults}
	                        className="btn btn-ghost whitespace-nowrap text-xs"
	                      >
	                        Restaurar padrão
	                      </button>
	                    </div>
	                  </div>
	                  {!whatsAppProfile?.numero && (
	                    <div className="card card-ring bg-[rgba(255,255,255,0.02)] px-4 py-3 text-xs text-muted">
	                      Para habilitar alertas por WhatsApp, valide seu número em{' '}
	                      <button type="button" onClick={handleOpenNotifications} className="underline underline-offset-4">
                        Notificações
                      </button>
	                      .
	                    </div>
	                  )}
	
	                  <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_72px_84px_92px_84px] sm:gap-3 sm:px-2">
	                    <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">Status</span>
	                    <span className="text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                      Alerta &gt;
	                    </span>
	                    <span className="text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                      Início
	                    </span>
	                    <span className="text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                      Notificar
	                    </span>
	                    <span className="text-center text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                      Tempo (min)
	                    </span>
	                  </div>
	
	                  <div className="space-y-3">
	                    {STATUS_TOTALS.map((status) => {
	                      const conf = statusConfig[status] ?? defaultStatusConfig(status);
                      const whatsappLocked = !whatsAppProfile?.numero;
                      const notifyDisabled = whatsappLocked;
	                      const timeDisabled = whatsappLocked || !conf.notifyWhatsApp;
	
	                      return (
	                        <div key={status} className="card card-ring p-3">
	                          <div className="sm:hidden">
	                            <div className="flex items-center justify-between gap-3">
	                              <div className="min-w-0">
	                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
	                                  {status.replace(/_/g, ' ')}
	                                </p>
	                              </div>
	                              <div className="flex items-center gap-3">
	                                <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                                  Notificar
	                                </span>
	                                <SwitchButton
	                                  checked={Boolean(conf.notifyWhatsApp)}
	                                  disabled={notifyDisabled}
	                                  onToggle={() => handleStatusNotifyWhatsAppChange(status, !Boolean(conf.notifyWhatsApp))}
	                                  ariaLabel={`Notificar ${status.replace(/_/g, ' ')}`}
	                                />
	                              </div>
	                            </div>
	
	                            <div className="mt-3 grid grid-cols-3 gap-2">
	                              <label className="space-y-1 text-xs text-muted">
	                                <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                                  Alerta &gt;
	                                </span>
	                                <input
	                                  type="number"
	                                  min={0}
	                                  max={999}
	                                  value={conf.alertThreshold}
	                                  onChange={(e) =>
	                                    handleStatusConfigChange(status, 'alertThreshold', Number(e.target.value))
	                                  }
	                                  className="input-field input-field-rect input-field-sm w-full text-center text-sm"
	                                />
	                              </label>
	
	                              <label className="space-y-1 text-xs text-muted">
	                                <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                                  Início
	                                </span>
	                                <input
	                                  type="number"
	                                  min={0}
	                                  max={9999}
	                                  value={conf.startFrom}
	                                  onChange={(e) =>
	                                    handleStatusConfigChange(status, 'startFrom', Number(e.target.value))
	                                  }
	                                  className="input-field input-field-rect input-field-sm w-full text-center text-sm"
	                                />
	                              </label>
	
	                              <label className="space-y-1 text-xs text-muted">
	                                <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
	                                  Tempo (min)
	                                </span>
	                                <input
	                                  type="number"
	                                  min={MIN_STATUS_NOTIFY_AFTER_MINUTES}
	                                  max={MAX_STATUS_NOTIFY_AFTER_MINUTES}
	                                  value={conf.notifyAfterMinutes}
	                                  disabled={timeDisabled}
	                                  onChange={(e) =>
	                                    handleStatusConfigChange(status, 'notifyAfterMinutes', Number(e.target.value))
	                                  }
	                                  className="input-field input-field-rect input-field-sm w-full text-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
	                                />
	                              </label>
	                            </div>
	                          </div>
	
	                          <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_72px_84px_92px_84px] sm:items-center sm:gap-3">
	                            <div className="min-w-0">
	                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
	                                {status.replace(/_/g, ' ')}
	                              </p>
	                            </div>
	
	                            <input
	                              type="number"
	                              min={0}
	                              max={999}
	                              value={conf.alertThreshold}
	                              onChange={(e) =>
	                                handleStatusConfigChange(status, 'alertThreshold', Number(e.target.value))
	                              }
	                              aria-label={`Alerta para ${status.replace(/_/g, ' ')}`}
	                              className="input-field input-field-rect input-field-sm w-full text-center text-sm"
	                            />
	
	                            <input
	                              type="number"
	                              min={0}
	                              max={9999}
	                              value={conf.startFrom}
	                              onChange={(e) => handleStatusConfigChange(status, 'startFrom', Number(e.target.value))}
	                              aria-label={`Início para ${status.replace(/_/g, ' ')}`}
	                              className="input-field input-field-rect input-field-sm w-full text-center text-sm"
	                            />
	
	                            <div className="flex justify-center">
	                              <SwitchButton
	                                checked={Boolean(conf.notifyWhatsApp)}
	                                disabled={notifyDisabled}
	                                onToggle={() => handleStatusNotifyWhatsAppChange(status, !Boolean(conf.notifyWhatsApp))}
	                                ariaLabel={`Notificar ${status.replace(/_/g, ' ')}`}
	                              />
	                            </div>
	
	                            <input
	                              type="number"
	                              min={MIN_STATUS_NOTIFY_AFTER_MINUTES}
	                              max={MAX_STATUS_NOTIFY_AFTER_MINUTES}
	                              value={conf.notifyAfterMinutes}
	                              disabled={timeDisabled}
	                              onChange={(e) =>
	                                handleStatusConfigChange(status, 'notifyAfterMinutes', Number(e.target.value))
	                              }
	                              aria-label={`Tempo em alerta para ${status.replace(/_/g, ' ')} (min)`}
	                              className="input-field input-field-rect input-field-sm w-full text-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
	                            />
	                          </div>
	                        </div>
	                      );
	                    })}

                      <div className="card card-ring p-3">
                        <div className="sm:hidden">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                                Token de sessão
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
                                Notificar
                              </span>
                              <SwitchButton
                                checked={Boolean(sessionTokenAlertConfig.notifyWhatsApp)}
                                disabled={!whatsAppProfile?.numero}
                                onToggle={() =>
                                  handleSessionTokenNotifyWhatsAppChange(!Boolean(sessionTokenAlertConfig.notifyWhatsApp))
                                }
                                ariaLabel="Notificar token de sessão"
                              />
                            </div>
                          </div>

                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <label className="space-y-1 text-xs text-muted">
                              <span className="text-[10px] font-semibold uppercase tracking-[0.26em] text-subtle">
                                Tempo (min)
                              </span>
                              <input
                                type="number"
                                min={MIN_SESSION_NOTIFY_AFTER_MINUTES}
                                max={MAX_SESSION_NOTIFY_AFTER_MINUTES}
                                value={sessionTokenAlertConfig.notifyAfterMinutes}
                                disabled={!whatsAppProfile?.numero || !sessionTokenAlertConfig.notifyWhatsApp}
                                onChange={(e) => handleSessionTokenNotifyAfterMinutesChange(Number(e.target.value))}
                                className="input-field input-field-rect input-field-sm w-full text-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
                              />
                            </label>
                          </div>
                        </div>

                        <div className="hidden sm:grid sm:grid-cols-[minmax(0,1fr)_72px_84px_92px_84px] sm:items-center sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-subtle">
                              Token de sessão
                            </p>
                          </div>

                          <span className="text-center text-sm text-subtle">—</span>
                          <span className="text-center text-sm text-subtle">—</span>

                          <div className="flex justify-center">
                            <SwitchButton
                              checked={Boolean(sessionTokenAlertConfig.notifyWhatsApp)}
                              disabled={!whatsAppProfile?.numero}
                              onToggle={() =>
                                handleSessionTokenNotifyWhatsAppChange(!Boolean(sessionTokenAlertConfig.notifyWhatsApp))
                              }
                              ariaLabel="Notificar token de sessão"
                            />
                          </div>

                          <input
                            type="number"
                            min={MIN_SESSION_NOTIFY_AFTER_MINUTES}
                            max={MAX_SESSION_NOTIFY_AFTER_MINUTES}
                            value={sessionTokenAlertConfig.notifyAfterMinutes}
                            disabled={!whatsAppProfile?.numero || !sessionTokenAlertConfig.notifyWhatsApp}
                            onChange={(e) => handleSessionTokenNotifyAfterMinutesChange(Number(e.target.value))}
                            aria-label="Tempo em alerta para token de sessão (min)"
                            className="input-field input-field-rect input-field-sm w-full text-center text-sm disabled:cursor-not-allowed disabled:opacity-50"
                          />
                        </div>

                        <p className="mt-3 text-xs text-muted">
                          Notifica se o token continuar inválido por {sessionTokenAlertConfig.notifyAfterMinutes} min.
                          Ao voltar válido, zera o alerta.
                        </p>
                      </div>
	                  </div>
	                </section>
	
	                <section className="card card-ring space-y-4 p-4 lg:row-span-2 lg:h-full lg:flex lg:flex-col">
	                <div className="flex items-center justify-between">
	                  <div>
	                    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Token de sessão</p>
	                    <p className="text-sm text-muted">Validar e atualizar PHPSESSID.</p>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => void validateSession()}
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

                  <div className="card card-ring mt-4 space-y-3 bg-[rgba(255,255,255,0.02)] px-4 py-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">
                        Documentação
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Abra o portal e siga o passo a passo para copiar o token.
                      </p>
                    </div>

                    <a
                      href={PHPSESSID_PORTAL_URL}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-ghost inline-flex w-full items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">Abrir portal NFSe Itapoá</span>
                      <span className="text-xs text-subtle">↗</span>
                    </a>

                    <button
                      type="button"
                      onClick={() => setShowPhpsessidVideo(true)}
                      className="card card-ring group w-full overflow-hidden p-0 text-left"
                      aria-label={`Assistir vídeo: ${PHPSESSID_VIDEO_LABEL}`}
                    >
                      <div className="relative">
                        <img
                          src={PHPSESSID_VIDEO_POSTER_URL}
                          alt="Miniatura do vídeo explicativo"
                          loading="lazy"
                          className="h-36 w-full object-cover"
                        />
                        <div className="absolute inset-0 bg-black/30 transition group-hover:bg-black/20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white">
                            <PlayIcon className="h-4 w-4" />
                            Assistir
                          </div>
                        </div>
                      </div>
                      <div className="px-4 py-3">
                        <p className="text-sm font-semibold text-white">{PHPSESSID_VIDEO_LABEL}</p>
                        <p className="mt-1 text-xs text-muted">Clique para assistir em tela grande.</p>
                      </div>
                    </button>
                  </div>
	                </div>
	              </section>

              <section className="card card-ring space-y-4 p-4">
                  <div className="flex items-center justify-between gap-3">
	                    <div>
	                      <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Auto refresh</p>
	                      <p className="text-sm text-muted">Atualizar totais automaticamente.</p>
	                    </div>
	                    <SwitchButton checked={autoRefreshEnabled} onToggle={toggleAutoRefresh} ariaLabel="Auto refresh" />
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

      {showPhpsessidVideo && (
        <div
          className="fixed inset-0 z-[60] flex items-end bg-black/80 backdrop-blur md:items-center md:justify-center"
          role="dialog"
          aria-modal="true"
          onMouseDown={() => setShowPhpsessidVideo(false)}
        >
          <div
            className="surface surface-sheet flex w-full max-h-[92vh] flex-col overflow-hidden sm:mx-4 md:max-w-5xl"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="border-b border-[rgba(255,255,255,0.06)] bg-[rgba(5,7,20,0.35)] px-4 pb-4 pt-4 backdrop-blur sm:px-6 sm:pt-6">
              <div className="mx-auto mb-3 h-1 w-12 rounded-full bg-[rgba(255,255,255,0.14)] md:hidden" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-subtle">Documentação</p>
                  <h2 className="text-xl font-semibold text-white">{PHPSESSID_VIDEO_LABEL}</h2>
                </div>
                <button type="button" onClick={() => setShowPhpsessidVideo(false)} className="btn btn-ghost text-sm">
                  Fechar
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-[calc(18px+env(safe-area-inset-bottom))] pt-5 sm:px-6">
              <video
                controls
                playsInline
                preload="metadata"
                poster={PHPSESSID_VIDEO_POSTER_URL}
                className="w-full max-h-[72vh] rounded-lg bg-black"
              >
                <source src={PHPSESSID_VIDEO_URL} type="video/mp4" />
              </video>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FaturamentosPage;
