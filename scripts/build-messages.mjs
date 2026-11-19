import { transform } from "@formatjs/unplugin/transform";
import { execFileSync } from "node:child_process";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const idInterpolationPattern = "[sha512:contenthash:base64:6]";
const catalogPath = "dist/messages_en.json";
const sourceFiles = (await readdir("src"))
  .filter((file) => file.endsWith(".ts"))
  .map((file) => `src/${file}`);

execFileSync(
  process.execPath,
  [
    fileURLToPath(import.meta.resolve("@formatjs/cli/bin/formatjs")),
    "extract",
    ...sourceFiles,
    "--out-file",
    catalogPath,
    "--id-interpolation-pattern",
    idInterpolationPattern,
  ],
  { stdio: "inherit" }
);

let output = "";
for (const file of await readdir("dist")) {
  if (!file.endsWith(".js")) continue;
  const path = `dist/${file}`;
  const compiled = await readFile(path, "utf8");
  const code = transform(compiled, path, { idInterpolationPattern })?.code ?? compiled;
  await writeFile(path, code);
  output += code;
}

const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
for (const id of Object.keys(catalog)) {
  if (!output.includes(id)) throw new Error(`Message ID missing from the build: ${id}`);
}
