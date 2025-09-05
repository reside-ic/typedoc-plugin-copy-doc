import type { Application } from "typedoc";
import { Plugin } from "./plugin.js";

export function load(app: Readonly<Application>) {
  new Plugin(app);
};
