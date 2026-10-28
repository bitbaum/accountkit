"use client";

import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { SignInMethods } from "./methods.js";
import { PasswordRecoveryForm } from "./recovery.js";
import {
  DEFAULT_AUTH_LABELS,
  authErrorText,
  fill,
  type AuthError,
  type AuthLabels,
} from "./labels.js";
import { MAX_PASSWORD_LENGTH, MIN_PASSWORD_LENGTH } from "./password.js";

/**
 * The account screens every product shows: sign in, create an account, and
 * the account page. Logic and words here, look in the product: pass `classes`
 * with your own class names and `labels` in your own language. The client is
 * the product's own (`createAuthClient({ plugins: authClientPlugins() })`).
 */

type Result<T = unknown> = Promise<{ data?: T | null; error?: AuthError }>;

/**
 * The only two calls the recovery form makes. A product on Better Auth passes
 * its client; a product on Auth.js (or anything else) passes a small adapter
 * with these two functions, so it need not implement the rest of the client.
 * A call may resolve `{ error }` or reject (a network failure): the form
 * leaves its busy state and shows the unavailable message in both cases.
 */
export interface PasswordRecoveryClient {
  requestPasswordReset?(input: { email: string; redirectTo: string }): Result;
  resetPassword?(input: { newPassword: string; token: string }): Result;
}

/** What these screens call on the product's better-auth client. */
export interface AuthClientLike extends PasswordRecoveryClient {
  signIn: {
    email(input: {
      email: string;
      password: string;
      callbackURL?: string;
    }): Result;
    social(input: {
      provider: string;
      callbackURL?: string;
      errorCallbackURL?: string;
    }): Result;
    magicLink(input: {
      email: string;
      name?: string;
      callbackURL?: string;
      errorCallbackURL?: string;
    }): Result;
    passkey(): Promise<{ error?: AuthError } | undefined | null>;
  };
  signUp: {
    email(input: {
      name: string;
      email: string;
      password: string;
      callbackURL?: string;
    }): Result;
  };
  signOut(): Result;
  sendVerificationEmail(input: { email: string; callbackURL?: string }): Result;
  updateUser(input: { name: string }): Result;
  deleteUser(input: { password?: string }): Result;
  linkSocial(input: { provider: string; callbackURL?: string }): Result;
  twoFactor: {
    verifyTotp(input: { code: string; trustDevice?: boolean }): Result;
    verifyBackupCode(input: { code: string; trustDevice?: boolean }): Result;
    enable(input: { password?: string }): Result<object>;
    disable(input: { password?: string }): Result;
  };
  passkey: {
    addPasskey(input: {
      name?: string;
    }): Promise<{ error?: AuthError } | undefined | null>;
    listUserPasskeys(): Result<Passkey[]>;
    deletePasskey(input: { id: string }): Result;
  };
}

type Passkey = { id: string; name?: string | null };

export interface AuthClasses {
  button: string;
  buttonQuiet: string;
  input: string;
  label: string;
  hint: string;
  notice: string;
  error: string;
  section: string;
  sectionTitle: string;
  divider: string;
  link: string;
  stack: string;
  field: string;
  check: string;
  /** The box around a password input that holds the show/hide eye. */
  inputWrap: string;
  /** The eye inside the password field. */
  reveal: string;
}

/** Class names styled by @bitbaum/accountkit/styles.css on --acct-* variables. */
export const DEFAULT_AUTH_CLASSES: AuthClasses = {
  button: "acct-auth-button",
  buttonQuiet: "acct-auth-button-quiet",
  input: "acct-auth-input",
  label: "acct-auth-label",
  hint: "acct-auth-hint",
  notice: "acct-auth-notice",
  error: "acct-auth-error",
  section: "acct-auth-section",
  sectionTitle: "acct-auth-section-title",
  divider: "acct-auth-divider",
  link: "acct-auth-link",
  stack: "acct-auth-stack",
  field: "acct-auth-field",
  check: "acct-auth-check",
  inputWrap: "acct-auth-input-wrap",
  reveal: "acct-auth-reveal",
};

/** An eye, struck through while the password shows. Decorative: the button carries the words. */
function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
      {open && <path d="M3 3l18 18" />}
    </svg>
  );
}

interface Common {
  client: AuthClientLike;
  methods: SignInMethods;
  labels?: AuthLabels;
  classes?: Partial<AuthClasses>;
}

const merge = (c?: Partial<AuthClasses>): AuthClasses => ({
  ...DEFAULT_AUTH_CLASSES,
  ...c,
});

function ErrorLine({
  message,
  className,
}: {
  message: string | null;
  className: string;
}) {
  if (!message) return null;
  return (
    <p role="alert" className={className}>
      {message}
    </p>
  );
}

const hasOidc = (methods: SignInMethods) => methods.signin || methods.orangecat;

function Divider({ label, className }: { label: string; className: string }) {
  return (
    <div className={className} role="separator">
      <span>{label}</span>
    </div>
  );
}

/** "Continue with …" for each OIDC method this deployment has switched on. */
export function OidcButtons({
  client,
  methods,
  labels = DEFAULT_AUTH_LABELS,
  classes,
  callbackURL,
  errorCallbackURL,
  onError,
}: Common & {
  callbackURL: string;
  errorCallbackURL: string;
  onError: (error: AuthError) => void;
}) {
  const c = merge(classes);
  const [busy, setBusy] = useState<string | null>(null);
  const providers = [
    methods.signin ? { id: "bitbaum-signin", label: labels.withSignin } : null,
    methods.orangecat ? { id: "orangecat", label: labels.withOrangecat } : null,
  ].filter((p): p is { id: string; label: string } => p !== null);
  if (providers.length === 0) return null;
  return (
    <div className={c.stack}>
      {providers.map((provider) => (
        <button
          key={provider.id}
          type="button"
          className={c.buttonQuiet}
          disabled={busy !== null}
          onClick={async () => {
            setBusy(provider.id);
            const { error } = await client.signIn.social({
              provider: provider.id,
              callbackURL,
              errorCallbackURL,
            });
            if (error) {
              onError(error);
              setBusy(null);
            }
          }}
        >
          {provider.label}
        </button>
      ))}
    </div>
  );
}

type Step = "start" | "twoFactor" | "linkSent";

/**
 * Every way in, on one screen: password, passkey, a link by email, and the
 * OIDC buttons this deployment has switched on. A second factor, when the
 * account has one, is asked for on the same card.
 */
export function SignInForm({
  client,
  methods,
  labels = DEFAULT_AUTH_LABELS,
  classes,
  next,
  signInPath,
  signUpLink,
  initialError = false,
}: Common & {
  /** Where to land, already localised (`/de/account`). */
  next: string;
  /** This page, localised: where a failed OIDC round trip comes back to. */
  signInPath: string;
  /** The link to the sign-up page, rendered by the product's router. */
  signUpLink: ReactNode;
  initialError?: boolean;
}) {
  const c = merge(classes);
  const [step, setStep] = useState<Step>("start");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [useBackup, setUseBackup] = useState(false);
  const [trustDevice, setTrustDevice] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(
    initialError ? labels.errors.generic : null,
  );
  const [unverified, setUnverified] = useState(false);
  const [recovery, setRecovery] = useState<{
    token?: string;
    invalid?: boolean;
  } | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get("token");
    const linkError =
      query.get("method") === "magic-link" && query.has("error");
    if (linkError) setError(labels.errors.SESSION_EXPIRED);
    if (!token && query.get("twoFactor") === "1") setStep("twoFactor");
    if (token || (!linkError && query.get("error") === "INVALID_TOKEN")) {
      setRecovery({ token: token || undefined, invalid: !token });
      // Keep bearer reset credentials out of the address bar, referrers and history.
      const url = new URL(window.location.href);
      url.searchParams.delete("token");
      url.searchParams.delete("error");
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
  }, [labels]);

  const fail = (e: AuthError) => {
    setError(authErrorText(labels, e));
    setUnverified(e?.code === "EMAIL_NOT_VERIFIED");
    setBusy(false);
  };
  const done = () => window.location.assign(next);

  async function withPassword(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: e } = await client.signIn.email({
      email,
      password,
      callbackURL: next,
    });
    if (e) return fail(e);
    if (
      data &&
      typeof data === "object" &&
      "twoFactorRedirect" in data &&
      data.twoFactorRedirect
    ) {
      setStep("twoFactor");
      setBusy(false);
      return;
    }
    done();
  }

  async function withSecondFactor(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const input = { code: code.trim(), trustDevice };
    const { error: e } = useBackup
      ? await client.twoFactor.verifyBackupCode(input)
      : await client.twoFactor.verifyTotp(input);
    if (e) return fail(e);
    done();
  }

  async function withLink() {
    if (!email) return setError(labels.errors.emailFirst);
    setBusy(true);
    setError(null);
    const { error: e } = await client.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `${signInPath}?method=magic-link&next=${encodeURIComponent(next)}`,
    });
    if (e) return fail(e);
    setStep("linkSent");
    setBusy(false);
  }

  async function withPasskey() {
    setBusy(true);
    setError(null);
    const result = await client.signIn.passkey();
    if (result?.error) return fail(result.error);
    if (
      result &&
      "data" in result &&
      result.data &&
      typeof result.data === "object" &&
      "twoFactorRedirect" in result.data &&
      result.data.twoFactorRedirect
    ) {
      setStep("twoFactor");
      setBusy(false);
      return;
    }
    done();
  }

  async function resendVerification() {
    setBusy(true);
    const { error: e } = await client.sendVerificationEmail({
      email,
      callbackURL: next,
    });
    if (e) return fail(e);
    setUnverified(false);
    setStep("linkSent");
    setBusy(false);
  }

  if (recovery) {
    return (
      <PasswordRecoveryForm
        client={client}
        methods={methods}
        labels={labels}
        classes={classes}
        signInPath={signInPath}
        next={next}
        initialEmail={email}
        token={recovery.token}
        invalidToken={recovery.invalid}
        onBack={() => {
          setRecovery(null);
          setError(null);
          setPassword("");
          setStep("start");
        }}
      />
    );
  }

  if (step === "linkSent") {
    return (
      <div className={c.stack}>
        <p className={c.notice} role="status">
          {fill(labels.checkInbox, { email })}
        </p>
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => setStep("start")}
        >
          {labels.back}
        </button>
      </div>
    );
  }

  if (step === "twoFactor") {
    return (
      <form onSubmit={withSecondFactor} className={c.stack}>
        <p className={c.hint}>
          {useBackup ? labels.backupPrompt : labels.totpPrompt}
        </p>
        <div className={c.field}>
          <label htmlFor="acct-code" className={c.label}>
            {useBackup ? labels.backupCode : labels.totpCode}
          </label>
          <input
            id="acct-code"
            className={c.input}
            inputMode={useBackup ? "text" : "numeric"}
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            required
          />
        </div>
        <label className={c.check}>
          <input
            type="checkbox"
            checked={trustDevice}
            onChange={(e) => setTrustDevice(e.target.checked)}
          />
          {labels.trustDevice}
        </label>
        <ErrorLine message={error} className={c.error} />
        <button type="submit" className={c.button} disabled={busy}>
          {labels.verify}
        </button>
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => setUseBackup(!useBackup)}
        >
          {useBackup ? labels.useTotp : labels.useBackup}
        </button>
      </form>
    );
  }

  return (
    <div className={c.stack}>
      <OidcButtons
        client={client}
        methods={methods}
        labels={labels}
        classes={classes}
        callbackURL={next}
        errorCallbackURL={`${signInPath}?error=oidc&next=${encodeURIComponent(next)}`}
        onError={fail}
      />
      {methods.passkey && (
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={withPasskey}
          disabled={busy}
        >
          {labels.withPasskey}
        </button>
      )}
      {(hasOidc(methods) || methods.passkey) && (
        <Divider label={labels.orEmail} className={c.divider} />
      )}
      <form onSubmit={withPassword} className={c.stack}>
        <div className={c.field}>
          <label htmlFor="acct-email" className={c.label}>
            {labels.email}
          </label>
          <input
            id="acct-email"
            type="email"
            className={c.input}
            autoComplete="username webauthn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className={c.field}>
          <label htmlFor="acct-password" className={c.label}>
            {labels.password}
          </label>
          <input
            id="acct-password"
            type="password"
            className={c.input}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </div>
        <ErrorLine message={error} className={c.error} />
        {unverified && methods.verifyEmail && (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={resendVerification}
            disabled={busy}
          >
            {labels.resendVerification}
          </button>
        )}
        <button type="submit" className={c.button} disabled={busy}>
          {labels.signIn}
        </button>
        {methods.magicLink && (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={withLink}
            disabled={busy}
          >
            {labels.withLink}
          </button>
        )}
        {methods.passwordReset &&
          client.requestPasswordReset &&
          client.resetPassword && (
            <button
              type="button"
              className={c.buttonQuiet}
              disabled={busy}
              onClick={() => setRecovery({})}
            >
              {(labels.recovery ?? DEFAULT_AUTH_LABELS.recovery)!.forgot}
            </button>
          )}
      </form>
      <p className={c.hint}>
        {labels.noAccount} {signUpLink}
      </p>
    </div>
  );
}

export { PasswordRecoveryForm } from "./recovery.js";

/**
 * A new account in one step. No real name is asked for — a display name is
 * optional and may be anything. A passkey is added from the account page once
 * the account exists.
 */
export function SignUpForm({
  client,
  methods,
  labels = DEFAULT_AUTH_LABELS,
  classes,
  next,
  signUpPath,
  signInPath = signUpPath.endsWith("/sign-up")
    ? signUpPath.replace(/sign-up$/, "sign-in")
    : "/sign-in",
  signInLink,
}: Common & {
  next: string;
  signUpPath: string;
  /** Where an existing account completes a second factor after passwordless signup. */
  signInPath?: string;
  /** The link to the sign-in page, rendered by the product's router. */
  signInLink: ReactNode;
}) {
  const c = merge(classes);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const visibility =
    labels.passwordVisibility ?? DEFAULT_AUTH_LABELS.passwordVisibility!;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"verify" | "link" | null>(null);

  const fail = (e: AuthError) => {
    setError(authErrorText(labels, e));
    setBusy(false);
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const { error: e } = await client.signUp.email({
      // No name is asked for: an account starts nameless and the product
      // shows the address until the person chooses one.
      name: "",
      email,
      password,
      callbackURL: next,
    });
    if (e) return fail(e);
    if (methods.verifyEmail) {
      setSent("verify");
      setBusy(false);
      return;
    }
    window.location.assign(next);
  }

  async function withLink() {
    if (!email) return setError(labels.errors.emailFirst);
    setBusy(true);
    setError(null);
    const { error: e } = await client.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `${signInPath}?method=magic-link&next=${encodeURIComponent(next)}`,
    });
    if (e) return fail(e);
    setSent("link");
    setBusy(false);
  }

  if (sent) {
    return (
      <p className={c.notice} role="status">
        {fill(sent === "verify" ? labels.confirmInbox : labels.checkInbox, {
          email,
        })}
      </p>
    );
  }

  return (
    <div className={c.stack}>
      <OidcButtons
        client={client}
        methods={methods}
        labels={labels}
        classes={classes}
        callbackURL={next}
        errorCallbackURL={`${signInPath}?error=oidc&next=${encodeURIComponent(next)}`}
        onError={fail}
      />
      {hasOidc(methods) && (
        <Divider label={labels.orEmail} className={c.divider} />
      )}
      <form onSubmit={submit} className={c.stack}>
        <div className={c.field}>
          <label htmlFor="acct-email" className={c.label}>
            {labels.email}
          </label>
          <input
            id="acct-email"
            type="email"
            className={c.input}
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </div>
        <div className={c.field}>
          <label htmlFor="acct-password" className={c.label}>
            {labels.password}
          </label>
          {/* One password field. Seeing what you typed is what a second
              "repeat password" field was for, at half the typing (owner,
              2026-10-26: "don't bother people"). */}
          <div className={c.inputWrap}>
            <input
              id="acct-password"
              type={passwordVisible ? "text" : "password"}
              className={c.input}
              autoComplete="new-password"
              minLength={MIN_PASSWORD_LENGTH}
              maxLength={MAX_PASSWORD_LENGTH}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <button
              type="button"
              className={c.reveal}
              aria-controls="acct-password"
              aria-pressed={passwordVisible}
              aria-label={passwordVisible ? visibility.hide : visibility.show}
              onClick={() => setPasswordVisible((visible) => !visible)}
            >
              <EyeIcon open={passwordVisible} />
            </button>
          </div>
        </div>
        <ErrorLine message={error} className={c.error} />
        <button type="submit" className={c.button} disabled={busy}>
          {labels.createAccount}
        </button>
        {methods.magicLink && (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={withLink}
            disabled={busy}
          >
            {labels.signUpWithLink}
          </button>
        )}
      </form>
      <p className={c.hint}>
        {labels.haveAccount} {signInLink}
      </p>
    </div>
  );
}

function Section({
  title,
  id,
  classes,
  children,
}: {
  title: string;
  id: string;
  classes: AuthClasses;
  children: ReactNode;
}) {
  return (
    <section className={classes.section} aria-labelledby={id}>
      <h2 id={id} className={classes.sectionTitle}>
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Everything about one's own account, and the way out of it. */
export function AccountPanel({
  client,
  methods,
  labels = DEFAULT_AUTH_LABELS,
  classes,
  user,
  linked,
  accountPath,
  homePath,
}: Common & {
  user: {
    name: string;
    /** Null when the account has no address that can receive mail. */
    email: string | null;
    emailVerified: boolean;
    role: string;
    twoFactorEnabled: boolean;
  };
  /** Provider ids of the sign-in methods this account has ("credential", "orangecat", …). */
  linked: string[];
  accountPath: string;
  homePath: string;
}) {
  const c = merge(classes);
  const a = labels.account;
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState(user.name);
  const [saved, setSaved] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[] | null>(null);
  const [totp, setTotp] = useState<{
    uri: string;
    backupCodes: string[];
  } | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [twoFactor, setTwoFactor] = useState(user.twoFactorEnabled);
  const [confirmDelete, setConfirmDelete] = useState("");

  const fail = (e: AuthError) => {
    setError(authErrorText(labels, e) ?? labels.errors.generic);
    setBusy(false);
  };

  const loadPasskeys = useCallback(async () => {
    const { data } = await client.passkey.listUserPasskeys();
    setPasskeys(data ?? []);
  }, [client]);
  useEffect(() => {
    let alive = true;
    void client.passkey.listUserPasskeys().then(({ data }) => {
      if (alive) setPasskeys(data ?? []);
    });
    return () => {
      alive = false;
    };
  }, [client]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    const { error: e } = await client.updateUser({ name: name.trim() });
    if (e) return fail(e);
    setSaved(true);
    setBusy(false);
  }

  async function addPasskey() {
    setBusy(true);
    setError(null);
    const result = await client.passkey.addPasskey({
      name: a.passkeyDefaultName,
    });
    if (result?.error) return fail(result.error);
    await loadPasskeys();
    setBusy(false);
  }

  async function removePasskey(id: string) {
    setBusy(true);
    const { error: e } = await client.passkey.deletePasskey({ id });
    if (e) return fail(e);
    await loadPasskeys();
    setBusy(false);
  }

  async function startTwoFactor() {
    setBusy(true);
    setError(null);
    const { data, error: e } = await client.twoFactor.enable({
      password: password || undefined,
    });
    if (e) return fail(e);
    if (!data || !("totpURI" in data)) return fail({});
    const setup = data as { totpURI: string; backupCodes: string[] };
    setTotp({ uri: setup.totpURI, backupCodes: setup.backupCodes });
    setBusy(false);
  }

  async function confirmTwoFactor(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    const { error: e } = await client.twoFactor.verifyTotp({
      code: code.trim(),
    });
    if (e) return fail(e);
    setTwoFactor(true);
    setTotp(null);
    setCode("");
    setBusy(false);
  }

  async function stopTwoFactor() {
    setBusy(true);
    setError(null);
    const { error: e } = await client.twoFactor.disable({
      password: password || undefined,
    });
    if (e) return fail(e);
    setTwoFactor(false);
    setBusy(false);
  }

  async function link(provider: string) {
    setBusy(true);
    const { error: e } = await client.linkSocial({
      provider,
      callbackURL: accountPath,
    });
    if (e) fail(e);
  }

  async function signOut() {
    await client.signOut();
    window.location.assign(homePath);
  }

  async function deleteAccount() {
    setBusy(true);
    const { error: e } = await client.deleteUser({
      password: password || undefined,
    });
    if (e) return fail(e);
    window.location.assign(homePath);
  }

  const oidc = [
    { id: "bitbaum-signin", label: labels.withSignin, on: methods.signin },
    { id: "orangecat", label: labels.withOrangecat, on: methods.orangecat },
  ];
  const methodName = (id: string) =>
    id === "credential"
      ? a.methodPassword
      : (oidc.find((o) => o.id === id)?.label ?? id);

  return (
    <div className={c.stack}>
      <ErrorLine message={error} className={c.error} />

      <Section title={a.profile} id="acct-profile" classes={c}>
        <form onSubmit={saveName} className={c.stack}>
          <div className={c.field}>
            <label htmlFor="acct-display-name" className={c.label}>
              {labels.displayName}
            </label>
            <input
              id="acct-display-name"
              className={c.input}
              maxLength={80}
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSaved(false);
              }}
            />
          </div>
          <dl className={c.hint}>
            <div>
              <dt style={{ display: "inline" }}>{labels.email}: </dt>
              <dd style={{ display: "inline", margin: 0 }}>
                {user.email ?? a.noEmail}
                {user.email && !user.emailVerified && ` (${a.unverified})`}
              </dd>
            </div>
            <div>
              <dt style={{ display: "inline" }}>{a.role}: </dt>
              <dd style={{ display: "inline", margin: 0 }}>
                {a.roles[user.role] ?? user.role}
              </dd>
            </div>
          </dl>
          <div>
            <button type="submit" className={c.button} disabled={busy}>
              {a.save}
            </button>{" "}
            {saved && <span role="status">{a.saved}</span>}
          </div>
        </form>
      </Section>

      <Section title={a.methods} id="acct-methods" classes={c}>
        <ul className={c.hint}>
          {linked.map((id) => (
            <li key={id}>{methodName(id)}</li>
          ))}
        </ul>
        <div className={c.stack}>
          {oidc
            .filter((o) => o.on && !linked.includes(o.id))
            .map((o) => (
              <button
                key={o.id}
                type="button"
                className={c.buttonQuiet}
                onClick={() => link(o.id)}
                disabled={busy}
              >
                {fill(a.link, { method: o.label })}
              </button>
            ))}
        </div>
      </Section>

      <Section title={a.passkeys} id="acct-passkeys" classes={c}>
        <p className={c.hint}>{a.passkeysLede}</p>
        {passkeys && passkeys.length > 0 && (
          <ul className={c.stack}>
            {passkeys.map((p) => (
              <li key={p.id}>
                <span>{p.name || a.passkeyDefaultName}</span>{" "}
                <button
                  type="button"
                  className={c.buttonQuiet}
                  onClick={() => removePasskey(p.id)}
                  disabled={busy}
                >
                  {a.remove}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          className={c.button}
          onClick={addPasskey}
          disabled={busy}
        >
          {a.addPasskey}
        </button>
      </Section>

      <Section title={a.twoFactor} id="acct-two-factor" classes={c}>
        <p className={c.hint}>{twoFactor ? a.twoFactorOn : a.twoFactorOff}</p>
        <div className={c.field}>
          <label htmlFor="acct-current-password" className={c.label}>
            {a.currentPassword}
          </label>
          <input
            id="acct-current-password"
            type="password"
            className={c.input}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="acct-current-password-hint"
          />
          <p id="acct-current-password-hint" className={c.hint}>
            {a.currentPasswordHint}
          </p>
        </div>
        {totp ? (
          <form onSubmit={confirmTwoFactor} className={c.stack}>
            <p className={c.notice}>{a.scan}</p>
            <a href={totp.uri} className={c.link}>
              {a.openAuthenticator}
            </a>
            <p className={c.hint}>{a.backupCodes}</p>
            <ul className={c.hint}>
              {totp.backupCodes.map((backup) => (
                <li key={backup}>
                  <code>{backup}</code>
                </li>
              ))}
            </ul>
            <div className={c.field}>
              <label htmlFor="acct-totp" className={c.label}>
                {labels.totpCode}
              </label>
              <input
                id="acct-totp"
                className={c.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                required
              />
            </div>
            <button type="submit" className={c.button} disabled={busy}>
              {a.turnOn}
            </button>
          </form>
        ) : twoFactor ? (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={stopTwoFactor}
            disabled={busy}
          >
            {a.turnOff}
          </button>
        ) : (
          <button
            type="button"
            className={c.button}
            onClick={startTwoFactor}
            disabled={busy}
          >
            {a.setUp}
          </button>
        )}
      </Section>

      <Section title={a.leave} id="acct-leave" classes={c}>
        <div className={c.stack}>
          <button type="button" className={c.buttonQuiet} onClick={signOut}>
            {a.signOut}
          </button>
          <div className={c.field}>
            <label htmlFor="acct-confirm-delete" className={c.label}>
              {fill(a.deleteConfirm, { word: a.deleteWord })}
            </label>
            <input
              id="acct-confirm-delete"
              className={c.input}
              value={confirmDelete}
              onChange={(e) => setConfirmDelete(e.target.value)}
            />
          </div>
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={deleteAccount}
            disabled={
              busy ||
              confirmDelete.trim().toLowerCase() !== a.deleteWord.toLowerCase()
            }
          >
            {a.delete}
          </button>
        </div>
      </Section>
    </div>
  );
}

export {
  DEFAULT_AUTH_LABELS,
  authErrorText,
  fill,
  type AuthError,
  type AuthLabels,
};
