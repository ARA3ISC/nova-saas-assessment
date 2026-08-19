'use client';

import { useEffect, useId, useState, type ReactNode } from 'react';

export function NovaMark({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`novaMark${compact ? ' novaMarkCompact' : ''}`}>
      <span aria-hidden="true">N</span>
      <strong>NOVA</strong>
    </div>
  );
}

type NavItem = { href: string; label: string; hint?: string };

export function AppShell({
  area,
  active,
  items,
  children,
  footer,
  requiredAccess,
  showSignOut = Boolean(requiredAccess),
}: {
  area: string;
  active: string;
  items: NavItem[];
  children: ReactNode;
  footer?: ReactNode;
  requiredAccess?: 'organization-administrator' | 'platform-administrator';
  showSignOut?: boolean;
}) {
  const [authorized, setAuthorized] = useState(!requiredAccess);
  useEffect(() => {
    if (!requiredAccess) return;
    let activeRequest = true;
    void fetch('/api/auth/me', { credentials: 'include' })
      .then(async (response) => {
        if (!activeRequest) return;
        if (!response.ok) {
          window.location.replace(
            `/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`,
          );
          return;
        }
        const body = (await response.json()) as {
          identity: {
            membership: { profile: string } | null;
            platformPrincipal: { id: string } | null;
          };
        };
        const allowed =
          requiredAccess === 'platform-administrator'
            ? Boolean(body.identity.platformPrincipal)
            : body.identity.membership?.profile === 'Administrator';
        if (!allowed) {
          window.location.replace('/');
          return;
        }
        setAuthorized(true);
      })
      .catch(() => {
        if (activeRequest) window.location.replace('/login');
      });
    return () => {
      activeRequest = false;
    };
  }, [requiredAccess]);

  async function signOut() {
    const csrfToken = document.cookie
      .split('; ')
      .find((item) => item.startsWith('nova_csrf='))
      ?.split('=')[1];
    const response = await fetch('/api/auth/logout', {
      method: 'DELETE',
      credentials: 'include',
      headers: csrfToken ? { 'X-CSRF-Token': csrfToken } : {},
    });
    if (response.ok) window.location.assign('/login');
  }

  if (!authorized) {
    return (
      <main className="sessionLoading" aria-live="polite">
        <span className="loadingMark" aria-hidden="true">
          N
        </span>
        <strong>Verifying your access…</strong>
      </main>
    );
  }
  return (
    <main className="appShell">
      <aside className="appSidebar">
        <NovaMark />
        <div className="sidebarArea">{area}</div>
        <nav aria-label={`${area} navigation`}>
          {items.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={active === item.href ? 'page' : undefined}
            >
              <span>{item.label}</span>
              {item.hint && <small>{item.hint}</small>}
            </a>
          ))}
        </nav>
        {(footer || showSignOut) && (
          <div className="sidebarFooter">
            {footer && <div>{footer}</div>}
            {showSignOut && (
              <button className="sidebarSignOut" type="button" onClick={() => void signOut()}>
                Sign out
              </button>
            )}
          </div>
        )}
      </aside>
      <section className="appCanvas">{children}</section>
    </main>
  );
}

export const tenantNav: NavItem[] = [
  { href: '/', label: 'Overview', hint: 'Organization home' },
  { href: '/portfolio', label: 'Portfolio', hint: 'Authorized Companies & scopes' },
  { href: '/administration/companies', label: 'Companies & scopes', hint: 'Operational structure' },
  { href: '/administration/collaborators', label: 'Collaborators', hint: 'People & invitations' },
  { href: '/administration/permissions', label: 'Permissions', hint: 'Effective access' },
  { href: '/administration/ownership', label: 'Ownership', hint: 'Sensitive governance' },
];

export const platformNav: NavItem[] = [
  { href: '/platform', label: 'Platform overview', hint: 'Provision accounts' },
  { href: '/platform/directory', label: 'Organizations', hint: 'Minimized directory' },
  { href: '/platform/lifecycle', label: 'Lifecycle', hint: 'Access & commercial state' },
  { href: '/platform/interventions', label: 'Interventions', hint: 'Narrow support actions' },
];

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumb,
}: {
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="pageHeader">
      {breadcrumb && <div className="breadcrumbs">{breadcrumb}</div>}
      <div className="pageHeaderRow">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="pageDescription">{description}</p>
        </div>
        {actions && <div className="pageActions">{actions}</div>}
      </div>
    </header>
  );
}

export function Card({
  title,
  description,
  children,
  className = '',
  actions,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
  actions?: ReactNode;
}) {
  return (
    <section className={`uiCard ${className}`}>
      {(title || description || actions) && (
        <header className="cardHeader">
          <div>
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions}
        </header>
      )}
      {children}
    </section>
  );
}

export function Feedback({
  tone = 'info',
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  children: ReactNode;
}) {
  return (
    <div className={`feedback feedback-${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">
        {tone === 'success' ? '✓' : tone === 'danger' ? '!' : tone === 'warning' ? '△' : 'i'}
      </span>
      <div>{children}</div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toLowerCase();
  const tone = /active|accepted|paid/.test(normalized)
    ? 'positive'
    : /suspend|disable|revok|expired/.test(normalized)
      ? 'negative'
      : /pending|provision|pilot|demo/.test(normalized)
        ? 'warning'
        : 'neutral';
  return (
    <span className={`statusBadge status-${tone}`}>
      <span aria-hidden="true">●</span>
      {status.replaceAll('_', ' ')}
    </span>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="emptyState">
      <span className="emptyIcon" aria-hidden="true">
        ◇
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action}
    </div>
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  size = 'medium',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  size?: 'small' | 'medium' | 'large';
}) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const closeOnEscape = (
      event: KeyboardEvent,
    ) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener(
      'keydown',
      closeOnEscape,
    );

    return () => {
      document.body.style.overflow =
        previousOverflow;

      document.removeEventListener(
        'keydown',
        closeOnEscape,
      );
    };
  }, [onClose, open]);

  if (!open) return null;

  return (
    <div
      className="uiDialogBackdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (
          event.target === event.currentTarget
        ) {
          onClose();
        }
      }}
    >
      <section
        className={`uiDialog uiDialog-${size}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <header className="uiDialogHeader">
          <div>
            <h2 id={titleId}>
              {title}
            </h2>

            {description && (
              <p>{description}</p>
            )}
          </div>

          <button
            className="iconButton"
            type="button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            ×
          </button>
        </header>

        <div className="uiDialogBody">
          {children}
        </div>
      </section>
    </div>
  );
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <footer className="uiDialogActions">{children}</footer>;
}

export function CheckboxRow({
  name,
  value,
  title,
  description,
  defaultChecked,
  required,
  disabled,
}: {
  name: string;
  value?: string;
  title: string;
  description?: string;
  defaultChecked?: boolean;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label className="uiCheckboxRow">
      <input
        name={name}
        type="checkbox"
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        disabled={disabled}
      />
      <span>
        <strong>{title}</strong>
        {description && <small>{description}</small>}
      </span>
    </label>
  );
}

type SelectorItem = { id: string; label: string; description?: string; disabled?: boolean };

export function SearchableChecklist({
  legend,
  name,
  items,
  emptyText,
  searchPlaceholder,
  defaultSelected = [],
}: {
  legend: string;
  name: string;
  items: SelectorItem[];
  emptyText: string;
  searchPlaceholder: string;
  defaultSelected?: string[];
}) {
  const [query, setQuery] = useState('');
  const selected = new Set(defaultSelected);
  const filtered = items.filter((item) =>
    `${item.label} ${item.description ?? ''}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  return (
    <fieldset className="uiChecklist">
      <legend>
        <span>{legend}</span>
        <b>{items.length}</b>
      </legend>
      <label className="uiChecklistSearch">
        <span className="srOnly">Search {legend}</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
        />
      </label>
      <div className="uiChecklistItems">
        {items.map((item) => {
          const visible = filtered.some((candidate) => candidate.id === item.id);
          return (
            <div className="uiChecklistOption" hidden={!visible} key={item.id}>
              <CheckboxRow
                name={name}
                value={item.id}
                title={item.label}
                {...(item.description ? { description: item.description } : {})}
                {...(item.disabled !== undefined ? { disabled: item.disabled } : {})}
                defaultChecked={selected.has(item.id)}
              />
            </div>
          );
        })}
        {!filtered.length && (
          <div className="uiChecklistEmpty">{query ? 'No matching records.' : emptyText}</div>
        )}
      </div>
    </fieldset>
  );
}

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
  asideTitle = 'Secure access to NOVA',
  asideText = 'Your identity, Organization, and permissions are verified by the server on every protected action.',
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
  asideTitle?: string;
  asideText?: string;
}) {
  return (
    <main className="publicShell">
      <aside>
        <NovaMark />
        <div className="publicAsideCopy">
          <p className="eyebrow">SECURE SAAS FOUNDATION</p>
          <h2>{asideTitle}</h2>
          <p>{asideText}</p>
          <ul>
            <li>First-party authentication</li>
            <li>Server-side sessions</li>
            <li>Organization-isolated access</li>
          </ul>
        </div>
        <small>NOVA · Decision cockpit foundation</small>
      </aside>
      <section className="publicPanel">
        <div className="publicCard">
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="pageDescription">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
