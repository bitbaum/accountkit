// The visual check: three menus as an app would mount them.
import { createRoot } from "react-dom/client";
import { AccountMenu, SignInError } from "../src/index.js";
import { SignInForm, type AuthClientLike } from "../src/auth/react.js";

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
