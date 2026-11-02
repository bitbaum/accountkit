// The visual check: three menus as an app would mount them.
import { createRoot } from "react-dom/client";
import { AccountMenu, SignInError } from "../src/index.js";
import {
  PasswordRecoveryForm,
  SignInForm,
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
    (id === "auth-recovery-adapter" && !adapterMode) ||
    (id === "auth-recovery" &&
      (signupMode || adapterMode || codeMode || lightningMode)) ||
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
