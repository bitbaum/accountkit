// Compile-time contract against the REAL Auth.js adapter type: it must fit
// withOrangecatIdentity and come back as the same type. v0.2.0 failed exactly
// this in petvity and surf-your-life ("Argument of type 'Adapter' is not
// assignable to parameter of type 'AdapterSlice'"), and no test could see it
// because nothing here imported an Auth.js type. @auth/core is a dev
// dependency for this file only; the published module imports nothing from it.
import type { Adapter, AdapterUser } from "@auth/core/adapters";
import {
  withOrangecatIdentity,
  type OrangecatUserStore,
} from "../../src/orangecat.js";

declare const base: Adapter;
declare const store: OrangecatUserStore<AdapterUser>;

const wrapped: Adapter = withOrangecatIdentity(base, store);
const kept: Adapter = withOrangecatIdentity(base, store, { keepTokens: true });
export { wrapped, kept };
