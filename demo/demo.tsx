// The visual check: three menus as an app would mount them.
import { createRoot } from "react-dom/client";
import { AccountMenu, SignInError } from "../src/index.js";
import {
  PasswordRecoveryForm,
  SignInForm,
  ClaimForm,
  SignUpForm,
  type AuthClientLike,
  type PasswordRecoveryClient,
} from "../src/auth/react.js";
import { authLabelsFor } from "../src/auth/translations.js";

const query = new URLSearchParams(window.location.search);
const signupMode = query.has("signup");
const adapterMode = query.has("adapter");
// ?words=<locale>: the sign-in card alone, in that language, every button on.
const wordsLocale = query.get("words");
// ?code: the sign-in link step with the code from the same email.
const codeMode = query.has("code");
// ?lightning: Lightning login, the wallet answering on the second poll.
const lightningMode = query.has("lightning");
// A product's own code as a way in, and a claim (AOZ).
const doorMode = query.has("door");
const claimMode = query.has("claim");

// An Auth.js product has no Better Auth client: it passes the two recovery
// calls only. The first call of each kind fails like a dropped connection.
const calls = { request: 0, reset: 0 };
const adapterClient: PasswordRecoveryClient = {
  requestPasswordReset: async (input) => {
    document.body.dataset.adapterRequest = JSON.stringify(input);
    if (calls.request++ === 0) throw new TypeError("Failed to fetch");
    return {};
  },
  resetPassword: async (input) => {
    document.body.dataset.adapterReset = JSON.stringify(input);
    if (calls.reset++ === 0) throw new TypeError("Failed to fetch");
    return {};
  },
};

mount(
  "auth-recovery-adapter",
  <PasswordRecoveryForm
    client={adapterClient}
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: false,
      verifyEmail: true,
      signin: false,
      orangecat: false,
      passwordReset: true,
    }}
    signInPath="/demo/index.html"
    next="/account"
    token={query.get("token") ?? undefined}
    onBack={() => undefined}
  />,
);

const recoveryClient = {
  requestPasswordReset: async (input: {
    email: string;
    redirectTo: string;
  }) => {
    document.body.dataset.recoveryRequest = JSON.stringify(input);
    return {};
  },
  resetPassword: async (input: { token: string; newPassword: string }) => {
    document.body.dataset.recoveryReset = JSON.stringify(input);
    return {};
  },
} as AuthClientLike;

mount(
  "auth-recovery",
  <SignInForm
    client={recoveryClient}
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: false,
      verifyEmail: true,
      signin: false,
      orangecat: false,
      passwordReset: true,
    }}
    signInPath="/demo/index.html"
    next="/account"
    signUpLink={<a href="#signup">Create an account</a>}
  />,
);

mount(
  "auth-words",
  <SignInForm
    client={recoveryClient}
    labels={authLabelsFor(wordsLocale ?? "en")}
    methods={{
      password: true,
      passkey: true,
      twoFactor: false,
      magicLink: true,
      verifyEmail: true,
      signin: true,
      // Every free provider Morulia can switch on: the longest label there is.
      signinProviders: [
        "Google",
        "Microsoft",
        "Facebook",
        "GitHub",
        "LinkedIn",
        "Discord",
        "GitLab",
        "Slack",
        "Twitch",
        "Reddit",
      ],
      orangecat: true,
      passwordReset: true,
    }}
    signInPath="/demo/index.html"
    next="/account"
  />,
);

// The link request answers { code: true } when the email carries a code.
const codeClient = {
  signIn: {
    magicLink: async () => ({ data: { status: true, code: true } }),
    emailOtp: async (input: { email: string; otp: string }) => {
      document.body.dataset.signInCode = JSON.stringify(input);
      return { error: { code: "INVALID_OTP", status: 400 } };
    },
  },
} as unknown as AuthClientLike;

mount(
  "auth-code",
  <SignInForm
    client={codeClient}
    labels={authLabelsFor(query.get("code") || "en")}
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: true,
      verifyEmail: false,
      signin: false,
      orangecat: false,
      passwordReset: false,
    }}
    signInPath="/demo/index.html"
    next="/account"
    signUpLink={<a href="#signup">Create an account</a>}
  />,
);

let polls = 0;
const lightningClient = {
  signIn: {},
  lightning: {
    start: async () => ({
      data: {
        k1: "00".repeat(32),
        // LUD-01's example: any LNURL draws the same way.
        lnurl:
          "LNURL1DP68GURN8GHJ7UM9WFMXJCM99E3K7MF0V9CXJ0M385EKVCENXC6R2C35XVUKXEFCV5MKVV34X5EKZD3EV56NYD3HXQURZEPEXEJXXEPNXSCRVWFNV9NXZCN9XQ6XYEFHVGCXXCMYXYMNSERXFQ5FNS",
      },
    }),
    signIn: async () => ({
      data: { status: ++polls >= 2 ? "signed-in" : "pending" },
    }),
    link: async () => ({ data: { status: "pending" } }),
  },
} as unknown as AuthClientLike;

mount(
  "auth-lightning",
  <SignInForm
    client={lightningClient}
    labels={authLabelsFor(query.get("lightning") || "en")}
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: false,
      verifyEmail: false,
      signin: false,
      orangecat: false,
      passwordReset: false,
      lightning: true,
    }}
    signInPath="/demo/index.html"
    next="#signed-in"
    signUpLink={<a href="#signup">Create an account</a>}
  />,
);

// The code door: a code for an account with a second factor is refused,
// any other is accepted. What was sent is recorded for the browser check.
const doorClient = {
  signIn: {},
  $fetch: async (path: string, options: { body: Record<string, unknown> }) => {
    document.body.dataset.doorCalls = String(
      Number(document.body.dataset.doorCalls ?? 0) + 1,
    );
    document.body.dataset.door = JSON.stringify({ path, ...options.body });
    return String(options.body.credential).endsWith("2FA")
      ? {
          error: {
            status: 403,
            code: "DOMAIN_CREDENTIAL_REQUIRES_ANOTHER_METHOD",
          },
        }
      : { data: { success: true } };
  },
} as unknown as AuthClientLike;

mount(
  "auth-door",
  <SignInForm
    client={doorClient}
    labels={authLabelsFor(query.get("door") || "en")}
    methods={{
      password: true,
      passkey: true,
      twoFactor: false,
      magicLink: false,
      verifyEmail: false,
      signin: false,
      orangecat: false,
      passwordReset: false,
    }}
    signInPath="/demo/index.html"
    next="#signed-in"
    signUpLink={<a href="#signup">Create an account</a>}
    codeDoor={{
      open: "Mit Code anmelden",
      label: "Zugangscode",
      placeholder: "AOZ-XXXXXX oder RES-XXXXXX",
      uppercase: true,
      param: "personal",
    }}
  />,
);

// A claim: an address already in use is refused, any other is signed in.
const claimClient = {
  signIn: {},
  $fetch: async (path: string, options: { body: Record<string, unknown> }) => {
    document.body.dataset.claim = JSON.stringify({ path, ...options.body });
    return options.body.email === "taken@example.ch"
      ? { error: { status: 409, code: "CLAIM_EMAIL_TAKEN" } }
      : { data: { success: true, status: "verify_email" } };
  },
} as unknown as AuthClientLike;

mount(
  "auth-claim",
  <ClaimForm
    client={claimClient}
    labels={authLabelsFor(query.get("claim") || "en")}
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: false,
      verifyEmail: true,
      signin: false,
      orangecat: false,
      passwordReset: false,
    }}
    next="/account"
    signInPath="/demo/index.html"
    signInLink={<a href="#signin">Sign in</a>}
    proof={{
      kind: "code",
      label: "Zugangscode",
      placeholder: "AOZ-XXXXXX",
      uppercase: true,
      prefix: "code:",
    }}
  />,
);

const groups = [
  {
    id: "nav",
    items: [
      { id: "settings", label: "Settings", href: "#settings" },
      { id: "projects", label: "Projects", href: "#projects" },
    ],
  },
];

function mount(id: string, node: React.ReactNode) {
  if (wordsLocale !== null && id !== "auth-words") return;
  if (
    (id === "auth-words" && wordsLocale === null) ||
    (id === "auth-code" && !codeMode) ||
    (id === "auth-lightning" && !lightningMode) ||
    (id === "auth-door" && !doorMode) ||
    (id === "auth-claim" && !claimMode) ||
    (id === "auth-recovery-adapter" && !adapterMode) ||
    (id === "auth-recovery" &&
      (signupMode ||
        adapterMode ||
        codeMode ||
        lightningMode ||
        doorMode ||
        claimMode)) ||
    (id === "auth-signup" && (!signupMode || adapterMode))
  )
    return;
  const el = document.getElementById(id);
  if (el) createRoot(el).render(node);
}

// Named, signs out successfully.
mount(
  "named",
  <AccountMenu
    user={{
      name: "George Botsmann",
      handle: "cato",
      email: "butaeff@gmail.com",
    }}
    groups={groups}
    extra={<span>Appearance: Auto</span>}
    onSignOut={() => {
      document.body.dataset.signedOut = "yes";
    }}
  />,
);

// No name, no photo — must show a glyph, not a letter from the email.
mount(
  "anonymous",
  <AccountMenu
    user={{ email: "firstname.lastname@example.com" }}
    onSignOut={() => {}}
  />,
);

// A sign-out that fails — the menu must say so.
mount(
  "failing",
  <AccountMenu
    user={{ name: "Cato", image: "/does-not-exist.png" }}
    groups={groups}
    onSignOut={() => Promise.reject(new Error("network"))}
  />,
);

// Other accounts: the first switches, the second fails like a dropped
// connection, the third has neither a name nor a photo.
mount(
  "switching",
  <AccountMenu
    user={{ name: "Bernardo Soares", handle: "soares" }}
    groups={groups}
    accounts={[
      {
        id: "main",
        note: "Main account",
        user: { name: "George Botsmann", handle: "cato", email: "x@y.z" },
      },
      {
        id: "failing",
        user: {
          name: "Ricardo Reis de Almeida e Vasconcelos",
          handle: "a_very_long_handle_indeed_1234567890",
        },
      },
      { id: "bare", user: { handle: "campos" } },
    ]}
    onSwitchAccount={(id) => {
      if (id === "failing") return Promise.reject(new Error("network"));
      document.body.dataset.switchedTo = id;
    }}
    onSignOut={() => undefined}
  />,
);

// The sign-in error screen: Try again restarts sign-in.
mount(
  "signin-error",
  <SignInError error="OAuthCallbackError" retry="#restart" home="#home" />,
);

mount(
  "auth-signup",
  <SignUpForm
    client={
      {
        signUp: {
          email: async (input: unknown) => {
            document.body.dataset.signupRequest = JSON.stringify(input);
            return {};
          },
        },
      } as AuthClientLike
    }
    methods={{
      password: true,
      passkey: false,
      twoFactor: false,
      magicLink: false,
      verifyEmail: true,
      signin: false,
      orangecat: false,
      passwordReset: true,
    }}
    next="/account"
    signUpPath="/sign-up"
    signInLink={<a href="#signin">Sign in</a>}
  />,
);
