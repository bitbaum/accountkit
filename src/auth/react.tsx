"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import type { SignInMethods } from "./methods.js";
import { PasswordRecoveryForm } from "./recovery.js";
import { unbroken } from "./unbroken.js";
import { UI_LOCALES_PROVIDERS, uiLocalesFor } from "./ui-locales.js";
import {
  DEFAULT_AUTH_LABELS,
  authErrorText,
  fill,
  signinButtonLabel,
  type AuthError,
  type AuthLabels,
} from "./labels.js";
import { PasswordField } from "./password-field.js";
import {
  LightningLogin,
  lightningWords,
  type LightningClient,
} from "./lightning-login.js";

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
      /** Extra authorize parameters; AccountKit sends OIDC `ui_locales`. */
      additionalParams?: Record<string, string>;
    }): Result;
    magicLink(input: {
      email: string;
      name?: string;
      callbackURL?: string;
      errorCallbackURL?: string;
    }): Result<object>;
    /** better-auth's emailOTPClient (in authClientPlugins): the code from the link's email. */
    emailOtp?(input: { email: string; otp: string }): Result<object>;
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
  /** lightningClient() from ./client (in authClientPlugins). */
  lightning?: LightningClient;
  /**
   * better-auth's own request function: the code door and ClaimForm call the
   * product's endpoints through it (`/sign-in/domain`, `/provision/claim`).
   */
  $fetch?: (
    path: string,
    options: { method: "POST"; body: Record<string, unknown> },
  ) => Promise<unknown>;
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

interface Common {
  client: AuthClientLike;
  methods: SignInMethods;
  labels?: AuthLabels;
  classes?: Partial<AuthClasses>;
  /**
   * The page's language (`de`, `de-CH`), sent to the shared sign-in and
   * OrangeCat as OIDC `ui_locales` so their page speaks it too. Defaults to
   * `<html lang>`.
   */
  locale?: string;
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

const hasOidc = (methods: SignInMethods) =>
  methods.signin || methods.orangecat || Boolean(methods.github);

function Divider({ label, className }: { label: string; className: string }) {
  return (
    <div className={className} role="separator">
      <span>{label}</span>
    </div>
  );
}

/** What a product endpoint answered: its body, or a refusal's status and code. */
type Answer =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; code: string };

async function post(
  client: AuthClientLike,
  path: string,
  body: Record<string, unknown>,
): Promise<Answer> {
  if (!client.$fetch) return { ok: false, status: 0, code: "" };
  try {
    const answer = (await client.$fetch(path, { method: "POST", body })) as {
      data?: Record<string, unknown> | null;
      error?: { status?: number; code?: string } | null;
    };
    if (answer?.error)
      return {
        ok: false,
        status: answer.error.status ?? 0,
        code: answer.error.code ?? "",
      };
    return { ok: true, data: answer?.data ?? {} };
  } catch {
    return { ok: false, status: 0, code: "" };
  }
}

function codeWords(labels: AuthLabels) {
  return { ...DEFAULT_AUTH_LABELS.code!, ...labels.code };
}

function claimWords(labels: AuthLabels) {
  return { ...DEFAULT_AUTH_LABELS.claim!, ...labels.claim };
}

/**
 * A product's own code as a way in: what it is called is the product's word
 * (AOZ: "Zugangscode", `AOZ-XXXXXX` or `RES-XXXXXX`); the server verifies it
 * as a domain credential (`domainCredentials`), which refuses an account
 * with a second factor and never lets a code session change account security.
 */
export interface CodeDoor {
  /** The quiet button that opens it ("Mit Code anmelden"). */
  open: string;
  /** The field's label ("Zugangscode"). */
  label: string;
  placeholder?: string;
  hint?: string;
  /** The product's codes are capitals: what is typed is shown and sent so. */
  uppercase?: boolean;
  /** A personal link carries the code in this query parameter: open the code and sign in once. */
  param?: string;
  /** Open the code first, for a product whose people mostly hold one. */
  first?: boolean;
}

/** The code door's own form: one field, the product's words, AccountKit's refusals. */
function CodeSignIn({
  client,
  door,
  labels,
  classes: c,
  onDone,
  onBack,
  initialCode,
}: {
  client: AuthClientLike;
  door: CodeDoor;
  labels: AuthLabels;
  classes: AuthClasses;
  onDone: () => void;
  onBack: () => void;
  initialCode?: string;
}) {
  const w = codeWords(labels);
  const [code, setCode] = useState(initialCode ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  const submit = useCallback(
    async (value: string) => {
      const credential = value.trim();
      if (!credential) return;
      setBusy(true);
      setError(null);
      const answer = await post(client, "/sign-in/domain", { credential });
      if (answer.ok) return onDone();
      setBusy(false);
      setError(
        answer.code === "DOMAIN_CREDENTIAL_REQUIRES_ANOTHER_METHOD"
          ? w.needsAnotherMethod
          : answer.status === 429
            ? labels.errors.rateLimited
            : answer.status === 0
              ? labels.errors.unavailable
              : w.invalid,
      );
    },
    [client, labels, onDone, w.invalid, w.needsAnotherMethod],
  );

  // A personal link signs in at once, once: a refusal leaves the field for a retry by hand.
  useEffect(() => {
    if (!initialCode || tried.current) return;
    tried.current = true;
    void submit(initialCode);
  }, [initialCode, submit]);

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        void submit(code);
      }}
      className={c.stack}
    >
      <div className={c.field}>
        <label htmlFor="acct-domain-code" className={c.label}>
          {door.label}
        </label>
        <input
          id="acct-domain-code"
          className={c.input}
          autoComplete="off"
          autoCapitalize={door.uppercase ? "characters" : undefined}
          spellCheck={false}
          placeholder={door.placeholder}
          value={code}
          onChange={(e) =>
            setCode(
              door.uppercase ? e.target.value.toUpperCase() : e.target.value,
            )
          }
          required
        />
        {door.hint && <p className={c.hint}>{door.hint}</p>}
      </div>
      <ErrorLine message={error} className={c.error} />
      <button type="submit" className={c.button} disabled={busy}>
        {unbroken(labels.signIn)}
      </button>
      <button
        type="button"
        className={c.buttonQuiet}
        onClick={onBack}
        disabled={busy}
      >
        {unbroken(w.useEmail)}
      </button>
    </form>
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
  locale,
}: Common & {
  callbackURL: string;
  errorCallbackURL: string;
  onError: (error: AuthError) => void;
}) {
  const c = merge(classes);
  const [busy, setBusy] = useState<string | null>(null);
  const providers = [
    methods.signin
      ? {
          id: "bitbaum-signin",
          label: signinButtonLabel(labels, methods.signinProviders),
        }
      : null,
    methods.orangecat ? { id: "orangecat", label: labels.withOrangecat } : null,
    methods.github
      ? {
          id: "github",
          label: labels.withGithub ?? DEFAULT_AUTH_LABELS.withGithub!,
        }
      : null,
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
            const uiLocales = UI_LOCALES_PROVIDERS.includes(provider.id)
              ? uiLocalesFor(locale)
              : undefined;
            const { error } = await client.signIn.social({
              provider: provider.id,
              callbackURL,
              errorCallbackURL,
              ...(uiLocales
                ? { additionalParams: { ui_locales: uiLocales } }
                : {}),
            });
            if (error) {
              onError(error);
              setBusy(null);
            }
          }}
        >
          {unbroken(provider.label)}
        </button>
      ))}
    </div>
  );
}

type Step = "start" | "twoFactor" | "linkSent" | "lightning" | "code";

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
  locale,
  next,
  signInPath,
  signUpLink,
  initialError = false,
  codeDoor,
}: Common & {
  /** Where to land, already localised (`/de/account`). */
  next: string;
  /** This page, localised: where a failed OIDC round trip comes back to. */
  signInPath: string;
  /** The link to the sign-up page, rendered by the product's router. */
  signUpLink: ReactNode;
  initialError?: boolean;
  /** A product's own code as a way in, beside everything else (see CodeDoor). */
  codeDoor?: CodeDoor;
}) {
  const c = merge(classes);
  const [step, setStep] = useState<Step>(codeDoor?.first ? "code" : "start");
  const [linkedCode, setLinkedCode] = useState<string | undefined>();
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
  // The link's email also carries a code when the server says so (./sign-in-code).
  const [codeSent, setCodeSent] = useState(false);
  const [signInCode, setSignInCode] = useState("");
  const [recovery, setRecovery] = useState<{
    token?: string;
    invalid?: boolean;
  } | null>(null);
  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    const token = query.get("token");
    // A personal link (`?code=…`): the code door opens with it and signs in
    // once. The code leaves the address bar, as a reset token does.
    const linked = codeDoor?.param ? query.get(codeDoor.param) : null;
    if (linked) {
      setLinkedCode(
        codeDoor?.uppercase ? linked.trim().toUpperCase() : linked.trim(),
      );
      setStep("code");
      const url = new URL(window.location.href);
      url.searchParams.delete(codeDoor!.param!);
      window.history.replaceState(
        null,
        "",
        url.pathname + url.search + url.hash,
      );
    }
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
  }, [labels, codeDoor?.param, codeDoor?.uppercase]);

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
    const { data, error: e } = await client.signIn.magicLink({
      email,
      callbackURL: next,
      errorCallbackURL: `${signInPath}?method=magic-link&next=${encodeURIComponent(next)}`,
    });
    if (e) return fail(e);
    setCodeSent(
      Boolean(
        client.signIn.emailOtp &&
        data &&
        typeof data === "object" &&
        "code" in data &&
        data.code === true,
      ),
    );
    setSignInCode("");
    setStep("linkSent");
    setBusy(false);
  }

  async function withCode(event: FormEvent) {
    event.preventDefault();
    if (!client.signIn.emailOtp) return;
    setBusy(true);
    setError(null);
    const { data, error: e } = await client.signIn.emailOtp({
      email,
      otp: signInCode.replace(/\s+/g, ""),
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

  if (step === "code" && codeDoor) {
    return (
      <CodeSignIn
        client={client}
        door={codeDoor}
        labels={labels}
        classes={c}
        onDone={done}
        onBack={() => {
          setError(null);
          setStep("start");
        }}
        initialCode={linkedCode}
      />
    );
  }

  if (step === "lightning" && client.lightning) {
    return (
      <LightningLogin
        client={client.lightning}
        labels={labels}
        classes={c}
        purpose="sign-in"
        onDone={done}
        onTwoFactor={() => setStep("twoFactor")}
        onBack={() => setStep("start")}
      />
    );
  }

  if (step === "linkSent") {
    return (
      <div className={c.stack}>
        <p className={c.notice} role="status">
          {fill(labels.checkInbox, { email })}
        </p>
        {codeSent && (
          <form onSubmit={withCode} className={c.stack}>
            <div className={c.field}>
              <label htmlFor="acct-sign-in-code" className={c.label}>
                {labels.codePrompt ?? DEFAULT_AUTH_LABELS.codePrompt}
              </label>
              <input
                id="acct-sign-in-code"
                className={c.input}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]*"
                maxLength={7}
                value={signInCode}
                onChange={(e) => setSignInCode(e.target.value)}
                required
              />
            </div>
            <ErrorLine message={error} className={c.error} />
            <button type="submit" className={c.button} disabled={busy}>
              {unbroken(
                labels.signInWithCode ?? DEFAULT_AUTH_LABELS.signInWithCode!,
              )}
            </button>
          </form>
        )}
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => {
            setError(null);
            setStep("start");
          }}
        >
          {unbroken(labels.back)}
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
          {unbroken(labels.verify)}
        </button>
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => setUseBackup(!useBackup)}
        >
          {unbroken(useBackup ? labels.useTotp : labels.useBackup)}
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
        locale={locale}
      />
      {methods.passkey && (
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={withPasskey}
          disabled={busy}
        >
          {unbroken(labels.withPasskey)}
        </button>
      )}
      {methods.lightning && client.lightning && (
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => {
            setError(null);
            setStep("lightning");
          }}
          disabled={busy}
        >
          {unbroken(lightningWords(labels).withLightning)}
        </button>
      )}
      {(hasOidc(methods) || methods.passkey || methods.lightning) && (
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
            {unbroken(labels.resendVerification)}
          </button>
        )}
        <button type="submit" className={c.button} disabled={busy}>
          {unbroken(labels.signIn)}
        </button>
        {methods.magicLink && (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={withLink}
            disabled={busy}
          >
            {unbroken(labels.withLink)}
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
              {unbroken(
                (labels.recovery ?? DEFAULT_AUTH_LABELS.recovery)!.forgot,
              )}
            </button>
          )}
      </form>
      {codeDoor && (
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => {
            setError(null);
            setStep("code");
          }}
          disabled={busy}
        >
          {unbroken(codeDoor.open)}
        </button>
      )}
      <p className={c.hint}>
        {labels.noAccount} {signUpLink}
      </p>
    </div>
  );
}

export { PasswordRecoveryForm } from "./recovery.js";
export { uiLocalesFor } from "./ui-locales.js";

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
  locale,
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<"verify" | "link" | null>(null);
  const [lightning, setLightning] = useState(false);

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

  if (lightning && client.lightning) {
    return (
      <LightningLogin
        client={client.lightning}
        labels={labels}
        classes={c}
        purpose="sign-in"
        onDone={() => window.location.assign(next)}
        // An existing account with a second factor finishes on sign-in.
        onTwoFactor={() =>
          window.location.assign(
            `${signInPath}?twoFactor=1&next=${encodeURIComponent(next)}`,
          )
        }
        onBack={() => setLightning(false)}
      />
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
        locale={locale}
      />
      {methods.lightning && client.lightning && (
        <button
          type="button"
          className={c.buttonQuiet}
          onClick={() => setLightning(true)}
          disabled={busy}
        >
          {unbroken(lightningWords(labels).withLightning)}
        </button>
      )}
      {(hasOidc(methods) || methods.lightning) && (
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
              2026-10-26: "don't bother people"). The reset form renders the
              same field. */}
          <PasswordField
            id="acct-password"
            value={password}
            onChange={setPassword}
            classes={c}
            labels={labels}
          />
        </div>
        <ErrorLine message={error} className={c.error} />
        <button type="submit" className={c.button} disabled={busy}>
          {unbroken(labels.createAccount)}
        </button>
        {methods.magicLink && (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={withLink}
            disabled={busy}
          >
            {unbroken(labels.signUpWithLink)}
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
  deletion,
  ownProfile = false,
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
  /**
   * What the panel offers in place of deleting the account, for a product
   * created with `accountDeletion: false`: its own way, such as a link to an
   * erasure request. Without it, the delete control.
   */
  deletion?: ReactNode;
  /**
   * True when the product shows and edits the person's name on its own page
   * (its own row is the one every table reads): the panel then leaves its
   * Profile section out, so one person never has two names that drift apart.
   */
  ownProfile?: boolean;
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
    {
      id: "bitbaum-signin",
      label: signinButtonLabel(labels, methods.signinProviders),
      on: methods.signin,
    },
    { id: "orangecat", label: labels.withOrangecat, on: methods.orangecat },
    {
      id: "github",
      label: labels.withGithub ?? DEFAULT_AUTH_LABELS.withGithub!,
      on: Boolean(methods.github),
    },
  ];
  const methodName = (id: string) =>
    id === "credential"
      ? a.methodPassword
      : id === "lightning"
        ? lightningWords(labels).name
        : (oidc.find((o) => o.id === id)?.label ?? id);
  const [linkingLightning, setLinkingLightning] = useState(false);

  return (
    <div className={c.stack}>
      <ErrorLine message={error} className={c.error} />

      {!ownProfile && (
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
                {unbroken(a.save)}
              </button>{" "}
              {saved && <span role="status">{a.saved}</span>}
            </div>
          </form>
        </Section>
      )}

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
                {unbroken(fill(a.link, { method: o.label }))}
              </button>
            ))}
          {methods.lightning &&
            client.lightning &&
            !linked.includes("lightning") &&
            (linkingLightning ? (
              <LightningLogin
                client={client.lightning}
                labels={labels}
                classes={c}
                purpose="link"
                onDone={() => window.location.reload()}
                onBack={() => setLinkingLightning(false)}
              />
            ) : (
              <button
                type="button"
                className={c.buttonQuiet}
                onClick={() => setLinkingLightning(true)}
                disabled={busy}
              >
                {unbroken(
                  fill(a.link, { method: lightningWords(labels).name }),
                )}
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
                  {unbroken(a.remove)}
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
          {unbroken(a.addPasskey)}
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
              {unbroken(a.turnOn)}
            </button>
          </form>
        ) : twoFactor ? (
          <button
            type="button"
            className={c.buttonQuiet}
            onClick={stopTwoFactor}
            disabled={busy}
          >
            {unbroken(a.turnOff)}
          </button>
        ) : (
          <button
            type="button"
            className={c.button}
            onClick={startTwoFactor}
            disabled={busy}
          >
            {unbroken(a.setUp)}
          </button>
        )}
      </Section>

      <Section title={a.leave} id="acct-leave" classes={c}>
        <div className={c.stack}>
          <button type="button" className={c.buttonQuiet} onClick={signOut}>
            {unbroken(a.signOut)}
          </button>
          {deletion ?? (
            <>
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
                  confirmDelete.trim().toLowerCase() !==
                    a.deleteWord.toLowerCase()
                }
              >
                {unbroken(a.delete)}
              </button>
            </>
          )}
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

/**
 * What a claim proves: a code the person types, or one the page already holds
 * (a personal claim link's token). `prefix` (or the given credential) is the
 * product's format for its provisioning (AOZ: `code:…`, `link:…`).
 */
export type ClaimProof =
  | {
      kind: "code";
      /** The field's label ("Zugangscode"). */
      label: string;
      placeholder?: string;
      hint?: string;
      uppercase?: boolean;
      /** Put before the typed code to make the credential the server resolves. */
      prefix?: string;
      /** A code already known (a link that carried it). */
      initial?: string;
    }
  | { kind: "given"; credential: string };

/**
 * Claiming an identity the product provisioned: a code or a claim link, an
 * email and a first password, sent to AccountKit's `/provision/claim` (the
 * server's `provisioning`). The server decides everything that matters: the
 * proof is taken once; an address already in use joins only on its own
 * password; a confirmed address of the identity must match. This form says
 * what happened in AccountKit's words and moves on: signed in, asked to
 * confirm the address, or asked to sign in for a second factor.
 */
export function ClaimForm({
  client,
  labels = DEFAULT_AUTH_LABELS,
  classes,
  next,
  signInPath,
  signInLink,
  proof,
}: Common & {
  /** Where to land once signed in. */
  next: string;
  /** The sign-in page, for a claim that still owes a second factor. */
  signInPath: string;
  /** The link to the sign-in page, rendered by the product's router. */
  signInLink: ReactNode;
  proof: ClaimProof;
}) {
  const c = merge(classes);
  const w = claimWords(labels);
  const [code, setCode] = useState(
    proof.kind === "code" ? (proof.initial ?? "") : "",
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<"verify_email" | "sign_in" | null>(
    null,
  );

  const refusals: Record<string, string> = {
    CLAIM_INVALID: w.invalid,
    CLAIM_ALREADY_CLAIMED: w.alreadyClaimed,
    CLAIM_EMAIL_TAKEN: w.emailTaken,
    CLAIM_EMAIL_NEEDS_RECOVERY: w.emailNeedsRecovery,
    CLAIM_LINK_PASSWORD_MISMATCH: w.linkPasswordMismatch,
    CLAIM_VERIFIED_EMAIL_MISMATCH: w.verifiedEmailMismatch,
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const credential =
      proof.kind === "given"
        ? proof.credential
        : `${proof.prefix ?? ""}${code.trim()}`;
    setBusy(true);
    setError(null);
    const answer = await post(client, "/provision/claim", {
      credential,
      email: email.trim(),
      password,
      callbackURL: next,
    });
    if (answer.ok) {
      const status = String(answer.data.status ?? "signed_in");
      if (status === "signed_in") return window.location.assign(next);
      setOutcome(status === "verify_email" ? "verify_email" : "sign_in");
      setBusy(false);
      return;
    }
    setBusy(false);
    setError(
      refusals[answer.code] ??
        (answer.status === 429
          ? labels.errors.rateLimited
          : answer.status === 400
            ? w.emailInvalid
            : answer.status === 0
              ? labels.errors.unavailable
              : labels.errors.generic),
    );
  }

  if (outcome === "verify_email") {
    return (
      <div className={c.stack}>
        <p className={c.notice} role="status">
          {fill(w.verifyEmail, { email: email.trim() })}
        </p>
        <p className={c.hint}>{signInLink}</p>
      </div>
    );
  }
  if (outcome === "sign_in") {
    return (
      <div className={c.stack}>
        <p className={c.notice} role="status">
          {w.signIn}
        </p>
        <button
          type="button"
          className={c.button}
          onClick={() => window.location.assign(signInPath)}
        >
          {unbroken(labels.signIn)}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className={c.stack}>
      {proof.kind === "code" && (
        <div className={c.field}>
          <label htmlFor="acct-claim-code" className={c.label}>
            {proof.label}
          </label>
          <input
            id="acct-claim-code"
            className={c.input}
            autoComplete="off"
            autoCapitalize={proof.uppercase ? "characters" : undefined}
            spellCheck={false}
            placeholder={proof.placeholder}
            value={code}
            onChange={(e) =>
              setCode(
                proof.uppercase ? e.target.value.toUpperCase() : e.target.value,
              )
            }
            required
          />
          {proof.hint && <p className={c.hint}>{proof.hint}</p>}
        </div>
      )}
      <div className={c.field}>
        <label htmlFor="acct-claim-email" className={c.label}>
          {labels.email}
        </label>
        <input
          id="acct-claim-email"
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
        <PasswordField
          id="acct-password"
          value={password}
          onChange={setPassword}
          classes={c}
          labels={labels}
        />
      </div>
      <ErrorLine message={error} className={c.error} />
      <button type="submit" className={c.button} disabled={busy}>
        {unbroken(w.submit)}
      </button>
      <p className={c.hint}>
        {labels.haveAccount} {signInLink}
      </p>
    </form>
  );
}
