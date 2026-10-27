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

const query = new URLSearchParams(window.location.search);
const signupMode = query.has("signup");
const adapterMode = query.has("adapter");

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
  if (
    (id === "auth-recovery-adapter" && !adapterMode) ||
    (id === "auth-recovery" && (signupMode || adapterMode)) ||
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
