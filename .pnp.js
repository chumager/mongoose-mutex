#!/usr/bin/env node

/* eslint-disable max-len, flowtype/require-valid-file-annotation, flowtype/require-return-type */
/* global packageInformationStores, null, $$SETUP_STATIC_TABLES */

// Used for the resolveUnqualified part of the resolution (ie resolving folder/index.js & file extensions)
// Deconstructed so that they aren't affected by any fs monkeypatching occuring later during the execution
const {statSync, lstatSync, readlinkSync, readFileSync, existsSync, realpathSync} = require('fs');

const Module = require('module');
const path = require('path');
const StringDecoder = require('string_decoder');

const ignorePattern = null ? new RegExp(null) : null;

const pnpFile = path.resolve(__dirname, __filename);
const builtinModules = new Set(Module.builtinModules || Object.keys(process.binding('natives')));

const topLevelLocator = {name: null, reference: null};
const blacklistedLocator = {name: NaN, reference: NaN};

// Used for compatibility purposes - cf setupCompatibilityLayer
const patchedModules = [];
const fallbackLocators = [topLevelLocator];

// Matches backslashes of Windows paths
const backwardSlashRegExp = /\\/g;

// Matches if the path must point to a directory (ie ends with /)
const isDirRegExp = /\/$/;

// Matches if the path starts with a valid path qualifier (./, ../, /)
// eslint-disable-next-line no-unused-vars
const isStrictRegExp = /^\.{0,2}\//;

// Splits a require request into its components, or return null if the request is a file path
const pathRegExp = /^(?![a-zA-Z]:[\\\/]|\\\\|\.{0,2}(?:\/|$))((?:@[^\/]+\/)?[^\/]+)\/?(.*|)$/;

// Keep a reference around ("module" is a common name in this context, so better rename it to something more significant)
const pnpModule = module;

/**
 * Used to disable the resolution hooks (for when we want to fallback to the previous resolution - we then need
 * a way to "reset" the environment temporarily)
 */

let enableNativeHooks = true;

/**
 * Simple helper function that assign an error code to an error, so that it can more easily be caught and used
 * by third-parties.
 */

function makeError(code, message, data = {}) {
  const error = new Error(message);
  return Object.assign(error, {code, data});
}

/**
 * Ensures that the returned locator isn't a blacklisted one.
 *
 * Blacklisted packages are packages that cannot be used because their dependencies cannot be deduced. This only
 * happens with peer dependencies, which effectively have different sets of dependencies depending on their parents.
 *
 * In order to deambiguate those different sets of dependencies, the Yarn implementation of PnP will generate a
 * symlink for each combination of <package name>/<package version>/<dependent package> it will find, and will
 * blacklist the target of those symlinks. By doing this, we ensure that files loaded through a specific path
 * will always have the same set of dependencies, provided the symlinks are correctly preserved.
 *
 * Unfortunately, some tools do not preserve them, and when it happens PnP isn't able anymore to deduce the set of
 * dependencies based on the path of the file that makes the require calls. But since we've blacklisted those paths,
 * we're able to print a more helpful error message that points out that a third-party package is doing something
 * incompatible!
 */

// eslint-disable-next-line no-unused-vars
function blacklistCheck(locator) {
  if (locator === blacklistedLocator) {
    throw makeError(
      `BLACKLISTED`,
      [
        `A package has been resolved through a blacklisted path - this is usually caused by one of your tools calling`,
        `"realpath" on the return value of "require.resolve". Since the returned values use symlinks to disambiguate`,
        `peer dependencies, they must be passed untransformed to "require".`,
      ].join(` `)
    );
  }

  return locator;
}

let packageInformationStores = new Map([
  ["eslint", new Map([
    ["6.8.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-eslint-6.8.0-62262d6729739f9275723824302fb227c8c93ffb-integrity/node_modules/eslint/"),
      packageDependencies: new Map([
        ["@babel/code-frame", "7.8.3"],
        ["ajv", "6.10.2"],
        ["chalk", "2.4.2"],
        ["cross-spawn", "6.0.5"],
        ["debug", "4.1.1"],
        ["doctrine", "3.0.0"],
        ["eslint-scope", "5.0.0"],
        ["eslint-utils", "1.4.3"],
        ["eslint-visitor-keys", "1.1.0"],
        ["espree", "6.1.2"],
        ["esquery", "1.0.1"],
        ["esutils", "2.0.3"],
        ["file-entry-cache", "5.0.1"],
        ["functional-red-black-tree", "1.0.1"],
        ["glob-parent", "5.1.0"],
        ["globals", "12.3.0"],
        ["ignore", "4.0.6"],
        ["import-fresh", "3.2.1"],
        ["imurmurhash", "0.1.4"],
        ["inquirer", "7.0.3"],
        ["is-glob", "4.0.1"],
        ["js-yaml", "3.13.1"],
        ["json-stable-stringify-without-jsonify", "1.0.1"],
        ["levn", "0.3.0"],
        ["lodash", "4.17.15"],
        ["minimatch", "3.0.4"],
        ["mkdirp", "0.5.1"],
        ["natural-compare", "1.4.0"],
        ["optionator", "0.8.3"],
        ["progress", "2.0.3"],
        ["regexpp", "2.0.1"],
        ["semver", "6.3.0"],
        ["strip-ansi", "5.2.0"],
        ["strip-json-comments", "3.0.1"],
        ["table", "5.4.6"],
        ["text-table", "0.2.0"],
        ["v8-compile-cache", "2.1.0"],
        ["eslint", "6.8.0"],
      ]),
    }],
  ])],
  ["@babel/code-frame", new Map([
    ["7.8.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-@babel-code-frame-7.8.3-33e25903d7481181534e12ec0a25f16b6fcf419e-integrity/node_modules/@babel/code-frame/"),
      packageDependencies: new Map([
        ["@babel/highlight", "7.8.3"],
        ["@babel/code-frame", "7.8.3"],
      ]),
    }],
  ])],
  ["@babel/highlight", new Map([
    ["7.8.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-@babel-highlight-7.8.3-28f173d04223eaaa59bc1d439a3836e6d1265797-integrity/node_modules/@babel/highlight/"),
      packageDependencies: new Map([
        ["chalk", "2.4.2"],
        ["esutils", "2.0.3"],
        ["js-tokens", "4.0.0"],
        ["@babel/highlight", "7.8.3"],
      ]),
    }],
  ])],
  ["chalk", new Map([
    ["2.4.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424-integrity/node_modules/chalk/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["escape-string-regexp", "1.0.5"],
        ["supports-color", "5.5.0"],
        ["chalk", "2.4.2"],
      ]),
    }],
  ])],
  ["ansi-styles", new Map([
    ["3.2.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d-integrity/node_modules/ansi-styles/"),
      packageDependencies: new Map([
        ["color-convert", "1.9.3"],
        ["ansi-styles", "3.2.1"],
      ]),
    }],
  ])],
  ["color-convert", new Map([
    ["1.9.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8-integrity/node_modules/color-convert/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
        ["color-convert", "1.9.3"],
      ]),
    }],
  ])],
  ["color-name", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25-integrity/node_modules/color-name/"),
      packageDependencies: new Map([
        ["color-name", "1.1.3"],
      ]),
    }],
  ])],
  ["escape-string-regexp", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4-integrity/node_modules/escape-string-regexp/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
      ]),
    }],
  ])],
  ["supports-color", new Map([
    ["5.5.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f-integrity/node_modules/supports-color/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
        ["supports-color", "5.5.0"],
      ]),
    }],
  ])],
  ["has-flag", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd-integrity/node_modules/has-flag/"),
      packageDependencies: new Map([
        ["has-flag", "3.0.0"],
      ]),
    }],
  ])],
  ["esutils", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-esutils-2.0.3-74d2eb4de0b8da1293711910d50775b9b710ef64-integrity/node_modules/esutils/"),
      packageDependencies: new Map([
        ["esutils", "2.0.3"],
      ]),
    }],
  ])],
  ["js-tokens", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499-integrity/node_modules/js-tokens/"),
      packageDependencies: new Map([
        ["js-tokens", "4.0.0"],
      ]),
    }],
  ])],
  ["ajv", new Map([
    ["6.10.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ajv-6.10.2-d3cea04d6b017b2894ad69040fec8b623eb4bd52-integrity/node_modules/ajv/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
        ["fast-json-stable-stringify", "2.1.0"],
        ["json-schema-traverse", "0.4.1"],
        ["uri-js", "4.2.2"],
        ["ajv", "6.10.2"],
      ]),
    }],
  ])],
  ["fast-deep-equal", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49-integrity/node_modules/fast-deep-equal/"),
      packageDependencies: new Map([
        ["fast-deep-equal", "2.0.1"],
      ]),
    }],
  ])],
  ["fast-json-stable-stringify", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-fast-json-stable-stringify-2.1.0-874bf69c6f404c2b5d99c481341399fd55892633-integrity/node_modules/fast-json-stable-stringify/"),
      packageDependencies: new Map([
        ["fast-json-stable-stringify", "2.1.0"],
      ]),
    }],
  ])],
  ["json-schema-traverse", new Map([
    ["0.4.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660-integrity/node_modules/json-schema-traverse/"),
      packageDependencies: new Map([
        ["json-schema-traverse", "0.4.1"],
      ]),
    }],
  ])],
  ["uri-js", new Map([
    ["4.2.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0-integrity/node_modules/uri-js/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
        ["uri-js", "4.2.2"],
      ]),
    }],
  ])],
  ["punycode", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec-integrity/node_modules/punycode/"),
      packageDependencies: new Map([
        ["punycode", "2.1.1"],
      ]),
    }],
  ])],
  ["cross-spawn", new Map([
    ["6.0.5", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4-integrity/node_modules/cross-spawn/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
        ["path-key", "2.0.1"],
        ["semver", "5.7.1"],
        ["shebang-command", "1.2.0"],
        ["which", "1.3.1"],
        ["cross-spawn", "6.0.5"],
      ]),
    }],
  ])],
  ["nice-try", new Map([
    ["1.0.5", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366-integrity/node_modules/nice-try/"),
      packageDependencies: new Map([
        ["nice-try", "1.0.5"],
      ]),
    }],
  ])],
  ["path-key", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40-integrity/node_modules/path-key/"),
      packageDependencies: new Map([
        ["path-key", "2.0.1"],
      ]),
    }],
  ])],
  ["semver", new Map([
    ["5.7.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-semver-5.7.1-a954f931aeba508d307bbf069eff0c01c96116f7-integrity/node_modules/semver/"),
      packageDependencies: new Map([
        ["semver", "5.7.1"],
      ]),
    }],
    ["6.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-semver-6.3.0-ee0a64c8af5e8ceea67687b133761e1becbd1d3d-integrity/node_modules/semver/"),
      packageDependencies: new Map([
        ["semver", "6.3.0"],
      ]),
    }],
  ])],
  ["shebang-command", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea-integrity/node_modules/shebang-command/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
        ["shebang-command", "1.2.0"],
      ]),
    }],
  ])],
  ["shebang-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3-integrity/node_modules/shebang-regex/"),
      packageDependencies: new Map([
        ["shebang-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["which", new Map([
    ["1.3.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a-integrity/node_modules/which/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
        ["which", "1.3.1"],
      ]),
    }],
  ])],
  ["isexe", new Map([
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10-integrity/node_modules/isexe/"),
      packageDependencies: new Map([
        ["isexe", "2.0.0"],
      ]),
    }],
  ])],
  ["debug", new Map([
    ["4.1.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791-integrity/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.1.2"],
        ["debug", "4.1.1"],
      ]),
    }],
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-debug-3.1.0-5bb5a0672628b64149566ba16819e61518c67261-integrity/node_modules/debug/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
        ["debug", "3.1.0"],
      ]),
    }],
  ])],
  ["ms", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009-integrity/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.1.2"],
      ]),
    }],
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8-integrity/node_modules/ms/"),
      packageDependencies: new Map([
        ["ms", "2.0.0"],
      ]),
    }],
  ])],
  ["doctrine", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961-integrity/node_modules/doctrine/"),
      packageDependencies: new Map([
        ["esutils", "2.0.3"],
        ["doctrine", "3.0.0"],
      ]),
    }],
  ])],
  ["eslint-scope", new Map([
    ["5.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-eslint-scope-5.0.0-e87c8887c73e8d1ec84f1ca591645c358bfc8fb9-integrity/node_modules/eslint-scope/"),
      packageDependencies: new Map([
        ["esrecurse", "4.2.1"],
        ["estraverse", "4.3.0"],
        ["eslint-scope", "5.0.0"],
      ]),
    }],
  ])],
  ["esrecurse", new Map([
    ["4.2.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf-integrity/node_modules/esrecurse/"),
      packageDependencies: new Map([
        ["estraverse", "4.3.0"],
        ["esrecurse", "4.2.1"],
      ]),
    }],
  ])],
  ["estraverse", new Map([
    ["4.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-estraverse-4.3.0-398ad3f3c5a24948be7725e83d11a7de28cdbd1d-integrity/node_modules/estraverse/"),
      packageDependencies: new Map([
        ["estraverse", "4.3.0"],
      ]),
    }],
  ])],
  ["eslint-utils", new Map([
    ["1.4.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-eslint-utils-1.4.3-74fec7c54d0776b6f67e0251040b5806564e981f-integrity/node_modules/eslint-utils/"),
      packageDependencies: new Map([
        ["eslint-visitor-keys", "1.1.0"],
        ["eslint-utils", "1.4.3"],
      ]),
    }],
  ])],
  ["eslint-visitor-keys", new Map([
    ["1.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-eslint-visitor-keys-1.1.0-e2a82cea84ff246ad6fb57f9bde5b46621459ec2-integrity/node_modules/eslint-visitor-keys/"),
      packageDependencies: new Map([
        ["eslint-visitor-keys", "1.1.0"],
      ]),
    }],
  ])],
  ["espree", new Map([
    ["6.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-espree-6.1.2-6c272650932b4f91c3714e5e7b5f5e2ecf47262d-integrity/node_modules/espree/"),
      packageDependencies: new Map([
        ["acorn", "7.1.0"],
        ["acorn-jsx", "5.1.0"],
        ["eslint-visitor-keys", "1.1.0"],
        ["espree", "6.1.2"],
      ]),
    }],
  ])],
  ["acorn", new Map([
    ["7.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-acorn-7.1.0-949d36f2c292535da602283586c2477c57eb2d6c-integrity/node_modules/acorn/"),
      packageDependencies: new Map([
        ["acorn", "7.1.0"],
      ]),
    }],
  ])],
  ["acorn-jsx", new Map([
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-acorn-jsx-5.1.0-294adb71b57398b0680015f0a38c563ee1db5384-integrity/node_modules/acorn-jsx/"),
      packageDependencies: new Map([
        ["acorn", "7.1.0"],
        ["acorn-jsx", "5.1.0"],
      ]),
    }],
  ])],
  ["esquery", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708-integrity/node_modules/esquery/"),
      packageDependencies: new Map([
        ["estraverse", "4.3.0"],
        ["esquery", "1.0.1"],
      ]),
    }],
  ])],
  ["file-entry-cache", new Map([
    ["5.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c-integrity/node_modules/file-entry-cache/"),
      packageDependencies: new Map([
        ["flat-cache", "2.0.1"],
        ["file-entry-cache", "5.0.1"],
      ]),
    }],
  ])],
  ["flat-cache", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0-integrity/node_modules/flat-cache/"),
      packageDependencies: new Map([
        ["flatted", "2.0.1"],
        ["rimraf", "2.6.3"],
        ["write", "1.0.3"],
        ["flat-cache", "2.0.1"],
      ]),
    }],
  ])],
  ["flatted", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-flatted-2.0.1-69e57caa8f0eacbc281d2e2cb458d46fdb449e08-integrity/node_modules/flatted/"),
      packageDependencies: new Map([
        ["flatted", "2.0.1"],
      ]),
    }],
  ])],
  ["rimraf", new Map([
    ["2.6.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab-integrity/node_modules/rimraf/"),
      packageDependencies: new Map([
        ["glob", "7.1.6"],
        ["rimraf", "2.6.3"],
      ]),
    }],
  ])],
  ["glob", new Map([
    ["7.1.6", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-glob-7.1.6-141f33b81a7c2492e125594307480c46679278a6-integrity/node_modules/glob/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
        ["inflight", "1.0.6"],
        ["inherits", "2.0.4"],
        ["minimatch", "3.0.4"],
        ["once", "1.4.0"],
        ["path-is-absolute", "1.0.1"],
        ["glob", "7.1.6"],
      ]),
    }],
  ])],
  ["fs.realpath", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f-integrity/node_modules/fs.realpath/"),
      packageDependencies: new Map([
        ["fs.realpath", "1.0.0"],
      ]),
    }],
  ])],
  ["inflight", new Map([
    ["1.0.6", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9-integrity/node_modules/inflight/"),
      packageDependencies: new Map([
        ["once", "1.4.0"],
        ["wrappy", "1.0.2"],
        ["inflight", "1.0.6"],
      ]),
    }],
  ])],
  ["once", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1-integrity/node_modules/once/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
        ["once", "1.4.0"],
      ]),
    }],
  ])],
  ["wrappy", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f-integrity/node_modules/wrappy/"),
      packageDependencies: new Map([
        ["wrappy", "1.0.2"],
      ]),
    }],
  ])],
  ["inherits", new Map([
    ["2.0.4", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c-integrity/node_modules/inherits/"),
      packageDependencies: new Map([
        ["inherits", "2.0.4"],
      ]),
    }],
  ])],
  ["minimatch", new Map([
    ["3.0.4", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083-integrity/node_modules/minimatch/"),
      packageDependencies: new Map([
        ["brace-expansion", "1.1.11"],
        ["minimatch", "3.0.4"],
      ]),
    }],
  ])],
  ["brace-expansion", new Map([
    ["1.1.11", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd-integrity/node_modules/brace-expansion/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
        ["concat-map", "0.0.1"],
        ["brace-expansion", "1.1.11"],
      ]),
    }],
  ])],
  ["balanced-match", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767-integrity/node_modules/balanced-match/"),
      packageDependencies: new Map([
        ["balanced-match", "1.0.0"],
      ]),
    }],
  ])],
  ["concat-map", new Map([
    ["0.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b-integrity/node_modules/concat-map/"),
      packageDependencies: new Map([
        ["concat-map", "0.0.1"],
      ]),
    }],
  ])],
  ["path-is-absolute", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f-integrity/node_modules/path-is-absolute/"),
      packageDependencies: new Map([
        ["path-is-absolute", "1.0.1"],
      ]),
    }],
  ])],
  ["write", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3-integrity/node_modules/write/"),
      packageDependencies: new Map([
        ["mkdirp", "0.5.1"],
        ["write", "1.0.3"],
      ]),
    }],
  ])],
  ["mkdirp", new Map([
    ["0.5.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903-integrity/node_modules/mkdirp/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
        ["mkdirp", "0.5.1"],
      ]),
    }],
  ])],
  ["minimist", new Map([
    ["0.0.8", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d-integrity/node_modules/minimist/"),
      packageDependencies: new Map([
        ["minimist", "0.0.8"],
      ]),
    }],
  ])],
  ["functional-red-black-tree", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327-integrity/node_modules/functional-red-black-tree/"),
      packageDependencies: new Map([
        ["functional-red-black-tree", "1.0.1"],
      ]),
    }],
  ])],
  ["glob-parent", new Map([
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-glob-parent-5.1.0-5f4c1d1e748d30cd73ad2944b3577a81b081e8c2-integrity/node_modules/glob-parent/"),
      packageDependencies: new Map([
        ["is-glob", "4.0.1"],
        ["glob-parent", "5.1.0"],
      ]),
    }],
  ])],
  ["is-glob", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc-integrity/node_modules/is-glob/"),
      packageDependencies: new Map([
        ["is-extglob", "2.1.1"],
        ["is-glob", "4.0.1"],
      ]),
    }],
  ])],
  ["is-extglob", new Map([
    ["2.1.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2-integrity/node_modules/is-extglob/"),
      packageDependencies: new Map([
        ["is-extglob", "2.1.1"],
      ]),
    }],
  ])],
  ["globals", new Map([
    ["12.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-globals-12.3.0-1e564ee5c4dded2ab098b0f88f24702a3c56be13-integrity/node_modules/globals/"),
      packageDependencies: new Map([
        ["type-fest", "0.8.1"],
        ["globals", "12.3.0"],
      ]),
    }],
  ])],
  ["type-fest", new Map([
    ["0.8.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-type-fest-0.8.1-09e249ebde851d3b1e48d27c105444667f17b83d-integrity/node_modules/type-fest/"),
      packageDependencies: new Map([
        ["type-fest", "0.8.1"],
      ]),
    }],
  ])],
  ["ignore", new Map([
    ["4.0.6", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc-integrity/node_modules/ignore/"),
      packageDependencies: new Map([
        ["ignore", "4.0.6"],
      ]),
    }],
  ])],
  ["import-fresh", new Map([
    ["3.2.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-import-fresh-3.2.1-633ff618506e793af5ac91bf48b72677e15cbe66-integrity/node_modules/import-fresh/"),
      packageDependencies: new Map([
        ["parent-module", "1.0.1"],
        ["resolve-from", "4.0.0"],
        ["import-fresh", "3.2.1"],
      ]),
    }],
  ])],
  ["parent-module", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-parent-module-1.0.1-691d2709e78c79fae3a156622452d00762caaaa2-integrity/node_modules/parent-module/"),
      packageDependencies: new Map([
        ["callsites", "3.1.0"],
        ["parent-module", "1.0.1"],
      ]),
    }],
  ])],
  ["callsites", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-callsites-3.1.0-b3630abd8943432f54b3f0519238e33cd7df2f73-integrity/node_modules/callsites/"),
      packageDependencies: new Map([
        ["callsites", "3.1.0"],
      ]),
    }],
  ])],
  ["resolve-from", new Map([
    ["4.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6-integrity/node_modules/resolve-from/"),
      packageDependencies: new Map([
        ["resolve-from", "4.0.0"],
      ]),
    }],
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-resolve-from-2.0.0-9480ab20e94ffa1d9e80a804c7ea147611966b57-integrity/node_modules/resolve-from/"),
      packageDependencies: new Map([
        ["resolve-from", "2.0.0"],
      ]),
    }],
  ])],
  ["imurmurhash", new Map([
    ["0.1.4", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea-integrity/node_modules/imurmurhash/"),
      packageDependencies: new Map([
        ["imurmurhash", "0.1.4"],
      ]),
    }],
  ])],
  ["inquirer", new Map([
    ["7.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-inquirer-7.0.3-f9b4cd2dff58b9f73e8d43759436ace15bed4567-integrity/node_modules/inquirer/"),
      packageDependencies: new Map([
        ["ansi-escapes", "4.3.0"],
        ["chalk", "2.4.2"],
        ["cli-cursor", "3.1.0"],
        ["cli-width", "2.2.0"],
        ["external-editor", "3.1.0"],
        ["figures", "3.1.0"],
        ["lodash", "4.17.15"],
        ["mute-stream", "0.0.8"],
        ["run-async", "2.3.0"],
        ["rxjs", "6.5.4"],
        ["string-width", "4.2.0"],
        ["strip-ansi", "5.2.0"],
        ["through", "2.3.8"],
        ["inquirer", "7.0.3"],
      ]),
    }],
  ])],
  ["ansi-escapes", new Map([
    ["4.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ansi-escapes-4.3.0-a4ce2b33d6b214b7950d8595c212f12ac9cc569d-integrity/node_modules/ansi-escapes/"),
      packageDependencies: new Map([
        ["type-fest", "0.8.1"],
        ["ansi-escapes", "4.3.0"],
      ]),
    }],
  ])],
  ["cli-cursor", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-cli-cursor-3.1.0-264305a7ae490d1d03bf0c9ba7c925d1753af307-integrity/node_modules/cli-cursor/"),
      packageDependencies: new Map([
        ["restore-cursor", "3.1.0"],
        ["cli-cursor", "3.1.0"],
      ]),
    }],
  ])],
  ["restore-cursor", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-restore-cursor-3.1.0-39f67c54b3a7a58cea5236d95cf0034239631f7e-integrity/node_modules/restore-cursor/"),
      packageDependencies: new Map([
        ["onetime", "5.1.0"],
        ["signal-exit", "3.0.2"],
        ["restore-cursor", "3.1.0"],
      ]),
    }],
  ])],
  ["onetime", new Map([
    ["5.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-onetime-5.1.0-fff0f3c91617fe62bb50189636e99ac8a6df7be5-integrity/node_modules/onetime/"),
      packageDependencies: new Map([
        ["mimic-fn", "2.1.0"],
        ["onetime", "5.1.0"],
      ]),
    }],
  ])],
  ["mimic-fn", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mimic-fn-2.1.0-7ed2c2ccccaf84d3ffcb7a69b57711fc2083401b-integrity/node_modules/mimic-fn/"),
      packageDependencies: new Map([
        ["mimic-fn", "2.1.0"],
      ]),
    }],
  ])],
  ["signal-exit", new Map([
    ["3.0.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d-integrity/node_modules/signal-exit/"),
      packageDependencies: new Map([
        ["signal-exit", "3.0.2"],
      ]),
    }],
  ])],
  ["cli-width", new Map([
    ["2.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639-integrity/node_modules/cli-width/"),
      packageDependencies: new Map([
        ["cli-width", "2.2.0"],
      ]),
    }],
  ])],
  ["external-editor", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-external-editor-3.1.0-cb03f740befae03ea4d283caed2741a83f335495-integrity/node_modules/external-editor/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
        ["iconv-lite", "0.4.24"],
        ["tmp", "0.0.33"],
        ["external-editor", "3.1.0"],
      ]),
    }],
  ])],
  ["chardet", new Map([
    ["0.7.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e-integrity/node_modules/chardet/"),
      packageDependencies: new Map([
        ["chardet", "0.7.0"],
      ]),
    }],
  ])],
  ["iconv-lite", new Map([
    ["0.4.24", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b-integrity/node_modules/iconv-lite/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
        ["iconv-lite", "0.4.24"],
      ]),
    }],
  ])],
  ["safer-buffer", new Map([
    ["2.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a-integrity/node_modules/safer-buffer/"),
      packageDependencies: new Map([
        ["safer-buffer", "2.1.2"],
      ]),
    }],
  ])],
  ["tmp", new Map([
    ["0.0.33", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9-integrity/node_modules/tmp/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
        ["tmp", "0.0.33"],
      ]),
    }],
  ])],
  ["os-tmpdir", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274-integrity/node_modules/os-tmpdir/"),
      packageDependencies: new Map([
        ["os-tmpdir", "1.0.2"],
      ]),
    }],
  ])],
  ["figures", new Map([
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-figures-3.1.0-4b198dd07d8d71530642864af2d45dd9e459c4ec-integrity/node_modules/figures/"),
      packageDependencies: new Map([
        ["escape-string-regexp", "1.0.5"],
        ["figures", "3.1.0"],
      ]),
    }],
  ])],
  ["lodash", new Map([
    ["4.17.15", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-lodash-4.17.15-b447f6670a0455bbfeedd11392eff330ea097548-integrity/node_modules/lodash/"),
      packageDependencies: new Map([
        ["lodash", "4.17.15"],
      ]),
    }],
  ])],
  ["mute-stream", new Map([
    ["0.0.8", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mute-stream-0.0.8-1630c42b2251ff81e2a283de96a5497ea92e5e0d-integrity/node_modules/mute-stream/"),
      packageDependencies: new Map([
        ["mute-stream", "0.0.8"],
      ]),
    }],
  ])],
  ["run-async", new Map([
    ["2.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0-integrity/node_modules/run-async/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
        ["run-async", "2.3.0"],
      ]),
    }],
  ])],
  ["is-promise", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa-integrity/node_modules/is-promise/"),
      packageDependencies: new Map([
        ["is-promise", "2.1.0"],
      ]),
    }],
  ])],
  ["rxjs", new Map([
    ["6.5.4", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-rxjs-6.5.4-e0777fe0d184cec7872df147f303572d414e211c-integrity/node_modules/rxjs/"),
      packageDependencies: new Map([
        ["tslib", "1.10.0"],
        ["rxjs", "6.5.4"],
      ]),
    }],
  ])],
  ["tslib", new Map([
    ["1.10.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a-integrity/node_modules/tslib/"),
      packageDependencies: new Map([
        ["tslib", "1.10.0"],
      ]),
    }],
  ])],
  ["string-width", new Map([
    ["4.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-string-width-4.2.0-952182c46cc7b2c313d1596e623992bd163b72b5-integrity/node_modules/string-width/"),
      packageDependencies: new Map([
        ["emoji-regex", "8.0.0"],
        ["is-fullwidth-code-point", "3.0.0"],
        ["strip-ansi", "6.0.0"],
        ["string-width", "4.2.0"],
      ]),
    }],
    ["3.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961-integrity/node_modules/string-width/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["strip-ansi", "5.2.0"],
        ["string-width", "3.1.0"],
      ]),
    }],
  ])],
  ["emoji-regex", new Map([
    ["8.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-emoji-regex-8.0.0-e818fd69ce5ccfcb404594f842963bf53164cc37-integrity/node_modules/emoji-regex/"),
      packageDependencies: new Map([
        ["emoji-regex", "8.0.0"],
      ]),
    }],
    ["7.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156-integrity/node_modules/emoji-regex/"),
      packageDependencies: new Map([
        ["emoji-regex", "7.0.3"],
      ]),
    }],
  ])],
  ["is-fullwidth-code-point", new Map([
    ["3.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-is-fullwidth-code-point-3.0.0-f116f8064fe90b3f7844a38997c0b75051269f1d-integrity/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "3.0.0"],
      ]),
    }],
    ["2.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f-integrity/node_modules/is-fullwidth-code-point/"),
      packageDependencies: new Map([
        ["is-fullwidth-code-point", "2.0.0"],
      ]),
    }],
  ])],
  ["strip-ansi", new Map([
    ["6.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-strip-ansi-6.0.0-0b1571dd7669ccd4f3e06e14ef1eed26225ae532-integrity/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "5.0.0"],
        ["strip-ansi", "6.0.0"],
      ]),
    }],
    ["5.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae-integrity/node_modules/strip-ansi/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.1.0"],
        ["strip-ansi", "5.2.0"],
      ]),
    }],
  ])],
  ["ansi-regex", new Map([
    ["5.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ansi-regex-5.0.0-388539f55179bf39339c81af30a654d69f87cb75-integrity/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "5.0.0"],
      ]),
    }],
    ["4.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997-integrity/node_modules/ansi-regex/"),
      packageDependencies: new Map([
        ["ansi-regex", "4.1.0"],
      ]),
    }],
  ])],
  ["through", new Map([
    ["2.3.8", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5-integrity/node_modules/through/"),
      packageDependencies: new Map([
        ["through", "2.3.8"],
      ]),
    }],
  ])],
  ["js-yaml", new Map([
    ["3.13.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-js-yaml-3.13.1-aff151b30bfdfa8e49e05da22e7415e9dfa37847-integrity/node_modules/js-yaml/"),
      packageDependencies: new Map([
        ["argparse", "1.0.10"],
        ["esprima", "4.0.1"],
        ["js-yaml", "3.13.1"],
      ]),
    }],
  ])],
  ["argparse", new Map([
    ["1.0.10", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911-integrity/node_modules/argparse/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
        ["argparse", "1.0.10"],
      ]),
    }],
  ])],
  ["sprintf-js", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c-integrity/node_modules/sprintf-js/"),
      packageDependencies: new Map([
        ["sprintf-js", "1.0.3"],
      ]),
    }],
  ])],
  ["esprima", new Map([
    ["4.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71-integrity/node_modules/esprima/"),
      packageDependencies: new Map([
        ["esprima", "4.0.1"],
      ]),
    }],
  ])],
  ["json-stable-stringify-without-jsonify", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651-integrity/node_modules/json-stable-stringify-without-jsonify/"),
      packageDependencies: new Map([
        ["json-stable-stringify-without-jsonify", "1.0.1"],
      ]),
    }],
  ])],
  ["levn", new Map([
    ["0.3.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee-integrity/node_modules/levn/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["levn", "0.3.0"],
      ]),
    }],
  ])],
  ["prelude-ls", new Map([
    ["1.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54-integrity/node_modules/prelude-ls/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
      ]),
    }],
  ])],
  ["type-check", new Map([
    ["0.3.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72-integrity/node_modules/type-check/"),
      packageDependencies: new Map([
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
      ]),
    }],
  ])],
  ["natural-compare", new Map([
    ["1.4.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7-integrity/node_modules/natural-compare/"),
      packageDependencies: new Map([
        ["natural-compare", "1.4.0"],
      ]),
    }],
  ])],
  ["optionator", new Map([
    ["0.8.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-optionator-0.8.3-84fa1d036fe9d3c7e21d99884b601167ec8fb495-integrity/node_modules/optionator/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
        ["fast-levenshtein", "2.0.6"],
        ["levn", "0.3.0"],
        ["prelude-ls", "1.1.2"],
        ["type-check", "0.3.2"],
        ["word-wrap", "1.2.3"],
        ["optionator", "0.8.3"],
      ]),
    }],
  ])],
  ["deep-is", new Map([
    ["0.1.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34-integrity/node_modules/deep-is/"),
      packageDependencies: new Map([
        ["deep-is", "0.1.3"],
      ]),
    }],
  ])],
  ["fast-levenshtein", new Map([
    ["2.0.6", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917-integrity/node_modules/fast-levenshtein/"),
      packageDependencies: new Map([
        ["fast-levenshtein", "2.0.6"],
      ]),
    }],
  ])],
  ["word-wrap", new Map([
    ["1.2.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-word-wrap-1.2.3-610636f6b1f703891bd34771ccb17fb93b47079c-integrity/node_modules/word-wrap/"),
      packageDependencies: new Map([
        ["word-wrap", "1.2.3"],
      ]),
    }],
  ])],
  ["progress", new Map([
    ["2.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8-integrity/node_modules/progress/"),
      packageDependencies: new Map([
        ["progress", "2.0.3"],
      ]),
    }],
  ])],
  ["regexpp", new Map([
    ["2.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f-integrity/node_modules/regexpp/"),
      packageDependencies: new Map([
        ["regexpp", "2.0.1"],
      ]),
    }],
  ])],
  ["strip-json-comments", new Map([
    ["3.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-strip-json-comments-3.0.1-85713975a91fb87bf1b305cca77395e40d2a64a7-integrity/node_modules/strip-json-comments/"),
      packageDependencies: new Map([
        ["strip-json-comments", "3.0.1"],
      ]),
    }],
  ])],
  ["table", new Map([
    ["5.4.6", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-table-5.4.6-1292d19500ce3f86053b05f0e8e7e4a3bb21079e-integrity/node_modules/table/"),
      packageDependencies: new Map([
        ["ajv", "6.10.2"],
        ["lodash", "4.17.15"],
        ["slice-ansi", "2.1.0"],
        ["string-width", "3.1.0"],
        ["table", "5.4.6"],
      ]),
    }],
  ])],
  ["slice-ansi", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636-integrity/node_modules/slice-ansi/"),
      packageDependencies: new Map([
        ["ansi-styles", "3.2.1"],
        ["astral-regex", "1.0.0"],
        ["is-fullwidth-code-point", "2.0.0"],
        ["slice-ansi", "2.1.0"],
      ]),
    }],
  ])],
  ["astral-regex", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9-integrity/node_modules/astral-regex/"),
      packageDependencies: new Map([
        ["astral-regex", "1.0.0"],
      ]),
    }],
  ])],
  ["text-table", new Map([
    ["0.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4-integrity/node_modules/text-table/"),
      packageDependencies: new Map([
        ["text-table", "0.2.0"],
      ]),
    }],
  ])],
  ["v8-compile-cache", new Map([
    ["2.1.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-v8-compile-cache-2.1.0-e14de37b31a6d194f5690d67efc4e7f6fc6ab30e-integrity/node_modules/v8-compile-cache/"),
      packageDependencies: new Map([
        ["v8-compile-cache", "2.1.0"],
      ]),
    }],
  ])],
  ["eslint-plugin-prettier", new Map([
    ["3.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-eslint-plugin-prettier-3.1.2-432e5a667666ab84ce72f945c72f77d996a5c9ba-integrity/node_modules/eslint-plugin-prettier/"),
      packageDependencies: new Map([
        ["eslint", "6.8.0"],
        ["prettier", "1.19.1"],
        ["prettier-linter-helpers", "1.0.0"],
        ["eslint-plugin-prettier", "3.1.2"],
      ]),
    }],
  ])],
  ["prettier-linter-helpers", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-prettier-linter-helpers-1.0.0-d23d41fe1375646de2d0104d3454a3008802cf7b-integrity/node_modules/prettier-linter-helpers/"),
      packageDependencies: new Map([
        ["fast-diff", "1.2.0"],
        ["prettier-linter-helpers", "1.0.0"],
      ]),
    }],
  ])],
  ["fast-diff", new Map([
    ["1.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-fast-diff-1.2.0-73ee11982d86caaf7959828d519cfe927fac5f03-integrity/node_modules/fast-diff/"),
      packageDependencies: new Map([
        ["fast-diff", "1.2.0"],
      ]),
    }],
  ])],
  ["mongoose", new Map([
    ["5.8.7", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mongoose-5.8.7-d175f8ac4c8ed7bf57b71aa4980aaa3525b923b2-integrity/node_modules/mongoose/"),
      packageDependencies: new Map([
        ["bson", "1.1.3"],
        ["kareem", "2.3.1"],
        ["mongodb", "3.4.1"],
        ["mongoose-legacy-pluralize", "1.0.2"],
        ["mpath", "0.6.0"],
        ["mquery", "3.2.2"],
        ["ms", "2.1.2"],
        ["regexp-clone", "1.0.0"],
        ["safe-buffer", "5.1.2"],
        ["sift", "7.0.1"],
        ["sliced", "1.0.1"],
        ["mongoose", "5.8.7"],
      ]),
    }],
  ])],
  ["bson", new Map([
    ["1.1.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-bson-1.1.3-aa82cb91f9a453aaa060d6209d0675114a8154d3-integrity/node_modules/bson/"),
      packageDependencies: new Map([
        ["bson", "1.1.3"],
      ]),
    }],
  ])],
  ["kareem", new Map([
    ["2.3.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-kareem-2.3.1-def12d9c941017fabfb00f873af95e9c99e1be87-integrity/node_modules/kareem/"),
      packageDependencies: new Map([
        ["kareem", "2.3.1"],
      ]),
    }],
  ])],
  ["mongodb", new Map([
    ["3.4.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mongodb-3.4.1-0d15e57e0ea0fc85b7a4fb9291b374c2e71652dc-integrity/node_modules/mongodb/"),
      packageDependencies: new Map([
        ["bson", "1.1.3"],
        ["require_optional", "1.0.1"],
        ["safe-buffer", "5.2.0"],
        ["saslprep", "1.0.3"],
        ["mongodb", "3.4.1"],
      ]),
    }],
  ])],
  ["require_optional", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-require-optional-1.0.1-4cf35a4247f64ca3df8c2ef208cc494b1ca8fc2e-integrity/node_modules/require_optional/"),
      packageDependencies: new Map([
        ["resolve-from", "2.0.0"],
        ["semver", "5.7.1"],
        ["require_optional", "1.0.1"],
      ]),
    }],
  ])],
  ["safe-buffer", new Map([
    ["5.2.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519-integrity/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.2.0"],
      ]),
    }],
    ["5.1.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d-integrity/node_modules/safe-buffer/"),
      packageDependencies: new Map([
        ["safe-buffer", "5.1.2"],
      ]),
    }],
  ])],
  ["saslprep", new Map([
    ["1.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-saslprep-1.0.3-4c02f946b56cf54297e347ba1093e7acac4cf226-integrity/node_modules/saslprep/"),
      packageDependencies: new Map([
        ["sparse-bitfield", "3.0.3"],
        ["saslprep", "1.0.3"],
      ]),
    }],
  ])],
  ["sparse-bitfield", new Map([
    ["3.0.3", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-sparse-bitfield-3.0.3-ff4ae6e68656056ba4b3e792ab3334d38273ca11-integrity/node_modules/sparse-bitfield/"),
      packageDependencies: new Map([
        ["memory-pager", "1.5.0"],
        ["sparse-bitfield", "3.0.3"],
      ]),
    }],
  ])],
  ["memory-pager", new Map([
    ["1.5.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-memory-pager-1.5.0-d8751655d22d384682741c972f2c3d6dfa3e66b5-integrity/node_modules/memory-pager/"),
      packageDependencies: new Map([
        ["memory-pager", "1.5.0"],
      ]),
    }],
  ])],
  ["mongoose-legacy-pluralize", new Map([
    ["1.0.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mongoose-legacy-pluralize-1.0.2-3ba9f91fa507b5186d399fb40854bff18fb563e4-integrity/node_modules/mongoose-legacy-pluralize/"),
      packageDependencies: new Map([
        ["mongoose-legacy-pluralize", "1.0.2"],
      ]),
    }],
  ])],
  ["mpath", new Map([
    ["0.6.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mpath-0.6.0-aa922029fca4f0f641f360e74c5c1b6a4c47078e-integrity/node_modules/mpath/"),
      packageDependencies: new Map([
        ["mpath", "0.6.0"],
      ]),
    }],
  ])],
  ["mquery", new Map([
    ["3.2.2", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-mquery-3.2.2-e1383a3951852ce23e37f619a9b350f1fb3664e7-integrity/node_modules/mquery/"),
      packageDependencies: new Map([
        ["bluebird", "3.5.1"],
        ["debug", "3.1.0"],
        ["regexp-clone", "1.0.0"],
        ["safe-buffer", "5.1.2"],
        ["sliced", "1.0.1"],
        ["mquery", "3.2.2"],
      ]),
    }],
  ])],
  ["bluebird", new Map([
    ["3.5.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-bluebird-3.5.1-d9551f9de98f1fcda1e683d17ee91a0602ee2eb9-integrity/node_modules/bluebird/"),
      packageDependencies: new Map([
        ["bluebird", "3.5.1"],
      ]),
    }],
  ])],
  ["regexp-clone", new Map([
    ["1.0.0", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-regexp-clone-1.0.0-222db967623277056260b992626354a04ce9bf63-integrity/node_modules/regexp-clone/"),
      packageDependencies: new Map([
        ["regexp-clone", "1.0.0"],
      ]),
    }],
  ])],
  ["sliced", new Map([
    ["1.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-sliced-1.0.1-0b3a662b5d04c3177b1926bea82b03f837a2ef41-integrity/node_modules/sliced/"),
      packageDependencies: new Map([
        ["sliced", "1.0.1"],
      ]),
    }],
  ])],
  ["sift", new Map([
    ["7.0.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-sift-7.0.1-47d62c50b159d316f1372f8b53f9c10cd21a4b08-integrity/node_modules/sift/"),
      packageDependencies: new Map([
        ["sift", "7.0.1"],
      ]),
    }],
  ])],
  ["prettier", new Map([
    ["1.19.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-prettier-1.19.1-f7d7f5ff8a9cd872a7be4ca142095956a60797cb-integrity/node_modules/prettier/"),
      packageDependencies: new Map([
        ["prettier", "1.19.1"],
      ]),
    }],
  ])],
  ["q", new Map([
    ["1.5.1", {
      packageLocation: path.resolve(__dirname, "../../../../.cache/yarn/v6/npm-q-1.5.1-7e32f75b41381291d04611f1bf14109ac00651d7-integrity/node_modules/q/"),
      packageDependencies: new Map([
        ["q", "1.5.1"],
      ]),
    }],
  ])],
  [null, new Map([
    [null, {
      packageLocation: path.resolve(__dirname, "./"),
      packageDependencies: new Map([
        ["eslint", "6.8.0"],
        ["eslint-plugin-prettier", "3.1.2"],
        ["mongoose", "5.8.7"],
        ["prettier", "1.19.1"],
        ["q", "1.5.1"],
      ]),
    }],
  ])],
]);

let locatorsByLocations = new Map([
  ["../../../../.cache/yarn/v6/npm-eslint-6.8.0-62262d6729739f9275723824302fb227c8c93ffb-integrity/node_modules/eslint/", {"name":"eslint","reference":"6.8.0"}],
  ["../../../../.cache/yarn/v6/npm-@babel-code-frame-7.8.3-33e25903d7481181534e12ec0a25f16b6fcf419e-integrity/node_modules/@babel/code-frame/", {"name":"@babel/code-frame","reference":"7.8.3"}],
  ["../../../../.cache/yarn/v6/npm-@babel-highlight-7.8.3-28f173d04223eaaa59bc1d439a3836e6d1265797-integrity/node_modules/@babel/highlight/", {"name":"@babel/highlight","reference":"7.8.3"}],
  ["../../../../.cache/yarn/v6/npm-chalk-2.4.2-cd42541677a54333cf541a49108c1432b44c9424-integrity/node_modules/chalk/", {"name":"chalk","reference":"2.4.2"}],
  ["../../../../.cache/yarn/v6/npm-ansi-styles-3.2.1-41fbb20243e50b12be0f04b8dedbf07520ce841d-integrity/node_modules/ansi-styles/", {"name":"ansi-styles","reference":"3.2.1"}],
  ["../../../../.cache/yarn/v6/npm-color-convert-1.9.3-bb71850690e1f136567de629d2d5471deda4c1e8-integrity/node_modules/color-convert/", {"name":"color-convert","reference":"1.9.3"}],
  ["../../../../.cache/yarn/v6/npm-color-name-1.1.3-a7d0558bd89c42f795dd42328f740831ca53bc25-integrity/node_modules/color-name/", {"name":"color-name","reference":"1.1.3"}],
  ["../../../../.cache/yarn/v6/npm-escape-string-regexp-1.0.5-1b61c0562190a8dff6ae3bb2cf0200ca130b86d4-integrity/node_modules/escape-string-regexp/", {"name":"escape-string-regexp","reference":"1.0.5"}],
  ["../../../../.cache/yarn/v6/npm-supports-color-5.5.0-e2e69a44ac8772f78a1ec0b35b689df6530efc8f-integrity/node_modules/supports-color/", {"name":"supports-color","reference":"5.5.0"}],
  ["../../../../.cache/yarn/v6/npm-has-flag-3.0.0-b5d454dc2199ae225699f3467e5a07f3b955bafd-integrity/node_modules/has-flag/", {"name":"has-flag","reference":"3.0.0"}],
  ["../../../../.cache/yarn/v6/npm-esutils-2.0.3-74d2eb4de0b8da1293711910d50775b9b710ef64-integrity/node_modules/esutils/", {"name":"esutils","reference":"2.0.3"}],
  ["../../../../.cache/yarn/v6/npm-js-tokens-4.0.0-19203fb59991df98e3a287050d4647cdeaf32499-integrity/node_modules/js-tokens/", {"name":"js-tokens","reference":"4.0.0"}],
  ["../../../../.cache/yarn/v6/npm-ajv-6.10.2-d3cea04d6b017b2894ad69040fec8b623eb4bd52-integrity/node_modules/ajv/", {"name":"ajv","reference":"6.10.2"}],
  ["../../../../.cache/yarn/v6/npm-fast-deep-equal-2.0.1-7b05218ddf9667bf7f370bf7fdb2cb15fdd0aa49-integrity/node_modules/fast-deep-equal/", {"name":"fast-deep-equal","reference":"2.0.1"}],
  ["../../../../.cache/yarn/v6/npm-fast-json-stable-stringify-2.1.0-874bf69c6f404c2b5d99c481341399fd55892633-integrity/node_modules/fast-json-stable-stringify/", {"name":"fast-json-stable-stringify","reference":"2.1.0"}],
  ["../../../../.cache/yarn/v6/npm-json-schema-traverse-0.4.1-69f6a87d9513ab8bb8fe63bdb0979c448e684660-integrity/node_modules/json-schema-traverse/", {"name":"json-schema-traverse","reference":"0.4.1"}],
  ["../../../../.cache/yarn/v6/npm-uri-js-4.2.2-94c540e1ff772956e2299507c010aea6c8838eb0-integrity/node_modules/uri-js/", {"name":"uri-js","reference":"4.2.2"}],
  ["../../../../.cache/yarn/v6/npm-punycode-2.1.1-b58b010ac40c22c5657616c8d2c2c02c7bf479ec-integrity/node_modules/punycode/", {"name":"punycode","reference":"2.1.1"}],
  ["../../../../.cache/yarn/v6/npm-cross-spawn-6.0.5-4a5ec7c64dfae22c3a14124dbacdee846d80cbc4-integrity/node_modules/cross-spawn/", {"name":"cross-spawn","reference":"6.0.5"}],
  ["../../../../.cache/yarn/v6/npm-nice-try-1.0.5-a3378a7696ce7d223e88fc9b764bd7ef1089e366-integrity/node_modules/nice-try/", {"name":"nice-try","reference":"1.0.5"}],
  ["../../../../.cache/yarn/v6/npm-path-key-2.0.1-411cadb574c5a140d3a4b1910d40d80cc9f40b40-integrity/node_modules/path-key/", {"name":"path-key","reference":"2.0.1"}],
  ["../../../../.cache/yarn/v6/npm-semver-5.7.1-a954f931aeba508d307bbf069eff0c01c96116f7-integrity/node_modules/semver/", {"name":"semver","reference":"5.7.1"}],
  ["../../../../.cache/yarn/v6/npm-semver-6.3.0-ee0a64c8af5e8ceea67687b133761e1becbd1d3d-integrity/node_modules/semver/", {"name":"semver","reference":"6.3.0"}],
  ["../../../../.cache/yarn/v6/npm-shebang-command-1.2.0-44aac65b695b03398968c39f363fee5deafdf1ea-integrity/node_modules/shebang-command/", {"name":"shebang-command","reference":"1.2.0"}],
  ["../../../../.cache/yarn/v6/npm-shebang-regex-1.0.0-da42f49740c0b42db2ca9728571cb190c98efea3-integrity/node_modules/shebang-regex/", {"name":"shebang-regex","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-which-1.3.1-a45043d54f5805316da8d62f9f50918d3da70b0a-integrity/node_modules/which/", {"name":"which","reference":"1.3.1"}],
  ["../../../../.cache/yarn/v6/npm-isexe-2.0.0-e8fbf374dc556ff8947a10dcb0572d633f2cfa10-integrity/node_modules/isexe/", {"name":"isexe","reference":"2.0.0"}],
  ["../../../../.cache/yarn/v6/npm-debug-4.1.1-3b72260255109c6b589cee050f1d516139664791-integrity/node_modules/debug/", {"name":"debug","reference":"4.1.1"}],
  ["../../../../.cache/yarn/v6/npm-debug-3.1.0-5bb5a0672628b64149566ba16819e61518c67261-integrity/node_modules/debug/", {"name":"debug","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-ms-2.1.2-d09d1f357b443f493382a8eb3ccd183872ae6009-integrity/node_modules/ms/", {"name":"ms","reference":"2.1.2"}],
  ["../../../../.cache/yarn/v6/npm-ms-2.0.0-5608aeadfc00be6c2901df5f9861788de0d597c8-integrity/node_modules/ms/", {"name":"ms","reference":"2.0.0"}],
  ["../../../../.cache/yarn/v6/npm-doctrine-3.0.0-addebead72a6574db783639dc87a121773973961-integrity/node_modules/doctrine/", {"name":"doctrine","reference":"3.0.0"}],
  ["../../../../.cache/yarn/v6/npm-eslint-scope-5.0.0-e87c8887c73e8d1ec84f1ca591645c358bfc8fb9-integrity/node_modules/eslint-scope/", {"name":"eslint-scope","reference":"5.0.0"}],
  ["../../../../.cache/yarn/v6/npm-esrecurse-4.2.1-007a3b9fdbc2b3bb87e4879ea19c92fdbd3942cf-integrity/node_modules/esrecurse/", {"name":"esrecurse","reference":"4.2.1"}],
  ["../../../../.cache/yarn/v6/npm-estraverse-4.3.0-398ad3f3c5a24948be7725e83d11a7de28cdbd1d-integrity/node_modules/estraverse/", {"name":"estraverse","reference":"4.3.0"}],
  ["../../../../.cache/yarn/v6/npm-eslint-utils-1.4.3-74fec7c54d0776b6f67e0251040b5806564e981f-integrity/node_modules/eslint-utils/", {"name":"eslint-utils","reference":"1.4.3"}],
  ["../../../../.cache/yarn/v6/npm-eslint-visitor-keys-1.1.0-e2a82cea84ff246ad6fb57f9bde5b46621459ec2-integrity/node_modules/eslint-visitor-keys/", {"name":"eslint-visitor-keys","reference":"1.1.0"}],
  ["../../../../.cache/yarn/v6/npm-espree-6.1.2-6c272650932b4f91c3714e5e7b5f5e2ecf47262d-integrity/node_modules/espree/", {"name":"espree","reference":"6.1.2"}],
  ["../../../../.cache/yarn/v6/npm-acorn-7.1.0-949d36f2c292535da602283586c2477c57eb2d6c-integrity/node_modules/acorn/", {"name":"acorn","reference":"7.1.0"}],
  ["../../../../.cache/yarn/v6/npm-acorn-jsx-5.1.0-294adb71b57398b0680015f0a38c563ee1db5384-integrity/node_modules/acorn-jsx/", {"name":"acorn-jsx","reference":"5.1.0"}],
  ["../../../../.cache/yarn/v6/npm-esquery-1.0.1-406c51658b1f5991a5f9b62b1dc25b00e3e5c708-integrity/node_modules/esquery/", {"name":"esquery","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-file-entry-cache-5.0.1-ca0f6efa6dd3d561333fb14515065c2fafdf439c-integrity/node_modules/file-entry-cache/", {"name":"file-entry-cache","reference":"5.0.1"}],
  ["../../../../.cache/yarn/v6/npm-flat-cache-2.0.1-5d296d6f04bda44a4630a301413bdbc2ec085ec0-integrity/node_modules/flat-cache/", {"name":"flat-cache","reference":"2.0.1"}],
  ["../../../../.cache/yarn/v6/npm-flatted-2.0.1-69e57caa8f0eacbc281d2e2cb458d46fdb449e08-integrity/node_modules/flatted/", {"name":"flatted","reference":"2.0.1"}],
  ["../../../../.cache/yarn/v6/npm-rimraf-2.6.3-b2d104fe0d8fb27cf9e0a1cda8262dd3833c6cab-integrity/node_modules/rimraf/", {"name":"rimraf","reference":"2.6.3"}],
  ["../../../../.cache/yarn/v6/npm-glob-7.1.6-141f33b81a7c2492e125594307480c46679278a6-integrity/node_modules/glob/", {"name":"glob","reference":"7.1.6"}],
  ["../../../../.cache/yarn/v6/npm-fs-realpath-1.0.0-1504ad2523158caa40db4a2787cb01411994ea4f-integrity/node_modules/fs.realpath/", {"name":"fs.realpath","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-inflight-1.0.6-49bd6331d7d02d0c09bc910a1075ba8165b56df9-integrity/node_modules/inflight/", {"name":"inflight","reference":"1.0.6"}],
  ["../../../../.cache/yarn/v6/npm-once-1.4.0-583b1aa775961d4b113ac17d9c50baef9dd76bd1-integrity/node_modules/once/", {"name":"once","reference":"1.4.0"}],
  ["../../../../.cache/yarn/v6/npm-wrappy-1.0.2-b5243d8f3ec1aa35f1364605bc0d1036e30ab69f-integrity/node_modules/wrappy/", {"name":"wrappy","reference":"1.0.2"}],
  ["../../../../.cache/yarn/v6/npm-inherits-2.0.4-0fa2c64f932917c3433a0ded55363aae37416b7c-integrity/node_modules/inherits/", {"name":"inherits","reference":"2.0.4"}],
  ["../../../../.cache/yarn/v6/npm-minimatch-3.0.4-5166e286457f03306064be5497e8dbb0c3d32083-integrity/node_modules/minimatch/", {"name":"minimatch","reference":"3.0.4"}],
  ["../../../../.cache/yarn/v6/npm-brace-expansion-1.1.11-3c7fcbf529d87226f3d2f52b966ff5271eb441dd-integrity/node_modules/brace-expansion/", {"name":"brace-expansion","reference":"1.1.11"}],
  ["../../../../.cache/yarn/v6/npm-balanced-match-1.0.0-89b4d199ab2bee49de164ea02b89ce462d71b767-integrity/node_modules/balanced-match/", {"name":"balanced-match","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-concat-map-0.0.1-d8a96bd77fd68df7793a73036a3ba0d5405d477b-integrity/node_modules/concat-map/", {"name":"concat-map","reference":"0.0.1"}],
  ["../../../../.cache/yarn/v6/npm-path-is-absolute-1.0.1-174b9268735534ffbc7ace6bf53a5a9e1b5c5f5f-integrity/node_modules/path-is-absolute/", {"name":"path-is-absolute","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-write-1.0.3-0800e14523b923a387e415123c865616aae0f5c3-integrity/node_modules/write/", {"name":"write","reference":"1.0.3"}],
  ["../../../../.cache/yarn/v6/npm-mkdirp-0.5.1-30057438eac6cf7f8c4767f38648d6697d75c903-integrity/node_modules/mkdirp/", {"name":"mkdirp","reference":"0.5.1"}],
  ["../../../../.cache/yarn/v6/npm-minimist-0.0.8-857fcabfc3397d2625b8228262e86aa7a011b05d-integrity/node_modules/minimist/", {"name":"minimist","reference":"0.0.8"}],
  ["../../../../.cache/yarn/v6/npm-functional-red-black-tree-1.0.1-1b0ab3bd553b2a0d6399d29c0e3ea0b252078327-integrity/node_modules/functional-red-black-tree/", {"name":"functional-red-black-tree","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-glob-parent-5.1.0-5f4c1d1e748d30cd73ad2944b3577a81b081e8c2-integrity/node_modules/glob-parent/", {"name":"glob-parent","reference":"5.1.0"}],
  ["../../../../.cache/yarn/v6/npm-is-glob-4.0.1-7567dbe9f2f5e2467bc77ab83c4a29482407a5dc-integrity/node_modules/is-glob/", {"name":"is-glob","reference":"4.0.1"}],
  ["../../../../.cache/yarn/v6/npm-is-extglob-2.1.1-a88c02535791f02ed37c76a1b9ea9773c833f8c2-integrity/node_modules/is-extglob/", {"name":"is-extglob","reference":"2.1.1"}],
  ["../../../../.cache/yarn/v6/npm-globals-12.3.0-1e564ee5c4dded2ab098b0f88f24702a3c56be13-integrity/node_modules/globals/", {"name":"globals","reference":"12.3.0"}],
  ["../../../../.cache/yarn/v6/npm-type-fest-0.8.1-09e249ebde851d3b1e48d27c105444667f17b83d-integrity/node_modules/type-fest/", {"name":"type-fest","reference":"0.8.1"}],
  ["../../../../.cache/yarn/v6/npm-ignore-4.0.6-750e3db5862087b4737ebac8207ffd1ef27b25fc-integrity/node_modules/ignore/", {"name":"ignore","reference":"4.0.6"}],
  ["../../../../.cache/yarn/v6/npm-import-fresh-3.2.1-633ff618506e793af5ac91bf48b72677e15cbe66-integrity/node_modules/import-fresh/", {"name":"import-fresh","reference":"3.2.1"}],
  ["../../../../.cache/yarn/v6/npm-parent-module-1.0.1-691d2709e78c79fae3a156622452d00762caaaa2-integrity/node_modules/parent-module/", {"name":"parent-module","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-callsites-3.1.0-b3630abd8943432f54b3f0519238e33cd7df2f73-integrity/node_modules/callsites/", {"name":"callsites","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-resolve-from-4.0.0-4abcd852ad32dd7baabfe9b40e00a36db5f392e6-integrity/node_modules/resolve-from/", {"name":"resolve-from","reference":"4.0.0"}],
  ["../../../../.cache/yarn/v6/npm-resolve-from-2.0.0-9480ab20e94ffa1d9e80a804c7ea147611966b57-integrity/node_modules/resolve-from/", {"name":"resolve-from","reference":"2.0.0"}],
  ["../../../../.cache/yarn/v6/npm-imurmurhash-0.1.4-9218b9b2b928a238b13dc4fb6b6d576f231453ea-integrity/node_modules/imurmurhash/", {"name":"imurmurhash","reference":"0.1.4"}],
  ["../../../../.cache/yarn/v6/npm-inquirer-7.0.3-f9b4cd2dff58b9f73e8d43759436ace15bed4567-integrity/node_modules/inquirer/", {"name":"inquirer","reference":"7.0.3"}],
  ["../../../../.cache/yarn/v6/npm-ansi-escapes-4.3.0-a4ce2b33d6b214b7950d8595c212f12ac9cc569d-integrity/node_modules/ansi-escapes/", {"name":"ansi-escapes","reference":"4.3.0"}],
  ["../../../../.cache/yarn/v6/npm-cli-cursor-3.1.0-264305a7ae490d1d03bf0c9ba7c925d1753af307-integrity/node_modules/cli-cursor/", {"name":"cli-cursor","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-restore-cursor-3.1.0-39f67c54b3a7a58cea5236d95cf0034239631f7e-integrity/node_modules/restore-cursor/", {"name":"restore-cursor","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-onetime-5.1.0-fff0f3c91617fe62bb50189636e99ac8a6df7be5-integrity/node_modules/onetime/", {"name":"onetime","reference":"5.1.0"}],
  ["../../../../.cache/yarn/v6/npm-mimic-fn-2.1.0-7ed2c2ccccaf84d3ffcb7a69b57711fc2083401b-integrity/node_modules/mimic-fn/", {"name":"mimic-fn","reference":"2.1.0"}],
  ["../../../../.cache/yarn/v6/npm-signal-exit-3.0.2-b5fdc08f1287ea1178628e415e25132b73646c6d-integrity/node_modules/signal-exit/", {"name":"signal-exit","reference":"3.0.2"}],
  ["../../../../.cache/yarn/v6/npm-cli-width-2.2.0-ff19ede8a9a5e579324147b0c11f0fbcbabed639-integrity/node_modules/cli-width/", {"name":"cli-width","reference":"2.2.0"}],
  ["../../../../.cache/yarn/v6/npm-external-editor-3.1.0-cb03f740befae03ea4d283caed2741a83f335495-integrity/node_modules/external-editor/", {"name":"external-editor","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-chardet-0.7.0-90094849f0937f2eedc2425d0d28a9e5f0cbad9e-integrity/node_modules/chardet/", {"name":"chardet","reference":"0.7.0"}],
  ["../../../../.cache/yarn/v6/npm-iconv-lite-0.4.24-2022b4b25fbddc21d2f524974a474aafe733908b-integrity/node_modules/iconv-lite/", {"name":"iconv-lite","reference":"0.4.24"}],
  ["../../../../.cache/yarn/v6/npm-safer-buffer-2.1.2-44fa161b0187b9549dd84bb91802f9bd8385cd6a-integrity/node_modules/safer-buffer/", {"name":"safer-buffer","reference":"2.1.2"}],
  ["../../../../.cache/yarn/v6/npm-tmp-0.0.33-6d34335889768d21b2bcda0aa277ced3b1bfadf9-integrity/node_modules/tmp/", {"name":"tmp","reference":"0.0.33"}],
  ["../../../../.cache/yarn/v6/npm-os-tmpdir-1.0.2-bbe67406c79aa85c5cfec766fe5734555dfa1274-integrity/node_modules/os-tmpdir/", {"name":"os-tmpdir","reference":"1.0.2"}],
  ["../../../../.cache/yarn/v6/npm-figures-3.1.0-4b198dd07d8d71530642864af2d45dd9e459c4ec-integrity/node_modules/figures/", {"name":"figures","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-lodash-4.17.15-b447f6670a0455bbfeedd11392eff330ea097548-integrity/node_modules/lodash/", {"name":"lodash","reference":"4.17.15"}],
  ["../../../../.cache/yarn/v6/npm-mute-stream-0.0.8-1630c42b2251ff81e2a283de96a5497ea92e5e0d-integrity/node_modules/mute-stream/", {"name":"mute-stream","reference":"0.0.8"}],
  ["../../../../.cache/yarn/v6/npm-run-async-2.3.0-0371ab4ae0bdd720d4166d7dfda64ff7a445a6c0-integrity/node_modules/run-async/", {"name":"run-async","reference":"2.3.0"}],
  ["../../../../.cache/yarn/v6/npm-is-promise-2.1.0-79a2a9ece7f096e80f36d2b2f3bc16c1ff4bf3fa-integrity/node_modules/is-promise/", {"name":"is-promise","reference":"2.1.0"}],
  ["../../../../.cache/yarn/v6/npm-rxjs-6.5.4-e0777fe0d184cec7872df147f303572d414e211c-integrity/node_modules/rxjs/", {"name":"rxjs","reference":"6.5.4"}],
  ["../../../../.cache/yarn/v6/npm-tslib-1.10.0-c3c19f95973fb0a62973fb09d90d961ee43e5c8a-integrity/node_modules/tslib/", {"name":"tslib","reference":"1.10.0"}],
  ["../../../../.cache/yarn/v6/npm-string-width-4.2.0-952182c46cc7b2c313d1596e623992bd163b72b5-integrity/node_modules/string-width/", {"name":"string-width","reference":"4.2.0"}],
  ["../../../../.cache/yarn/v6/npm-string-width-3.1.0-22767be21b62af1081574306f69ac51b62203961-integrity/node_modules/string-width/", {"name":"string-width","reference":"3.1.0"}],
  ["../../../../.cache/yarn/v6/npm-emoji-regex-8.0.0-e818fd69ce5ccfcb404594f842963bf53164cc37-integrity/node_modules/emoji-regex/", {"name":"emoji-regex","reference":"8.0.0"}],
  ["../../../../.cache/yarn/v6/npm-emoji-regex-7.0.3-933a04052860c85e83c122479c4748a8e4c72156-integrity/node_modules/emoji-regex/", {"name":"emoji-regex","reference":"7.0.3"}],
  ["../../../../.cache/yarn/v6/npm-is-fullwidth-code-point-3.0.0-f116f8064fe90b3f7844a38997c0b75051269f1d-integrity/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"3.0.0"}],
  ["../../../../.cache/yarn/v6/npm-is-fullwidth-code-point-2.0.0-a3b30a5c4f199183167aaab93beefae3ddfb654f-integrity/node_modules/is-fullwidth-code-point/", {"name":"is-fullwidth-code-point","reference":"2.0.0"}],
  ["../../../../.cache/yarn/v6/npm-strip-ansi-6.0.0-0b1571dd7669ccd4f3e06e14ef1eed26225ae532-integrity/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"6.0.0"}],
  ["../../../../.cache/yarn/v6/npm-strip-ansi-5.2.0-8c9a536feb6afc962bdfa5b104a5091c1ad9c0ae-integrity/node_modules/strip-ansi/", {"name":"strip-ansi","reference":"5.2.0"}],
  ["../../../../.cache/yarn/v6/npm-ansi-regex-5.0.0-388539f55179bf39339c81af30a654d69f87cb75-integrity/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"5.0.0"}],
  ["../../../../.cache/yarn/v6/npm-ansi-regex-4.1.0-8b9f8f08cf1acb843756a839ca8c7e3168c51997-integrity/node_modules/ansi-regex/", {"name":"ansi-regex","reference":"4.1.0"}],
  ["../../../../.cache/yarn/v6/npm-through-2.3.8-0dd4c9ffaabc357960b1b724115d7e0e86a2e1f5-integrity/node_modules/through/", {"name":"through","reference":"2.3.8"}],
  ["../../../../.cache/yarn/v6/npm-js-yaml-3.13.1-aff151b30bfdfa8e49e05da22e7415e9dfa37847-integrity/node_modules/js-yaml/", {"name":"js-yaml","reference":"3.13.1"}],
  ["../../../../.cache/yarn/v6/npm-argparse-1.0.10-bcd6791ea5ae09725e17e5ad988134cd40b3d911-integrity/node_modules/argparse/", {"name":"argparse","reference":"1.0.10"}],
  ["../../../../.cache/yarn/v6/npm-sprintf-js-1.0.3-04e6926f662895354f3dd015203633b857297e2c-integrity/node_modules/sprintf-js/", {"name":"sprintf-js","reference":"1.0.3"}],
  ["../../../../.cache/yarn/v6/npm-esprima-4.0.1-13b04cdb3e6c5d19df91ab6987a8695619b0aa71-integrity/node_modules/esprima/", {"name":"esprima","reference":"4.0.1"}],
  ["../../../../.cache/yarn/v6/npm-json-stable-stringify-without-jsonify-1.0.1-9db7b59496ad3f3cfef30a75142d2d930ad72651-integrity/node_modules/json-stable-stringify-without-jsonify/", {"name":"json-stable-stringify-without-jsonify","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-levn-0.3.0-3b09924edf9f083c0490fdd4c0bc4421e04764ee-integrity/node_modules/levn/", {"name":"levn","reference":"0.3.0"}],
  ["../../../../.cache/yarn/v6/npm-prelude-ls-1.1.2-21932a549f5e52ffd9a827f570e04be62a97da54-integrity/node_modules/prelude-ls/", {"name":"prelude-ls","reference":"1.1.2"}],
  ["../../../../.cache/yarn/v6/npm-type-check-0.3.2-5884cab512cf1d355e3fb784f30804b2b520db72-integrity/node_modules/type-check/", {"name":"type-check","reference":"0.3.2"}],
  ["../../../../.cache/yarn/v6/npm-natural-compare-1.4.0-4abebfeed7541f2c27acfb29bdbbd15c8d5ba4f7-integrity/node_modules/natural-compare/", {"name":"natural-compare","reference":"1.4.0"}],
  ["../../../../.cache/yarn/v6/npm-optionator-0.8.3-84fa1d036fe9d3c7e21d99884b601167ec8fb495-integrity/node_modules/optionator/", {"name":"optionator","reference":"0.8.3"}],
  ["../../../../.cache/yarn/v6/npm-deep-is-0.1.3-b369d6fb5dbc13eecf524f91b070feedc357cf34-integrity/node_modules/deep-is/", {"name":"deep-is","reference":"0.1.3"}],
  ["../../../../.cache/yarn/v6/npm-fast-levenshtein-2.0.6-3d8a5c66883a16a30ca8643e851f19baa7797917-integrity/node_modules/fast-levenshtein/", {"name":"fast-levenshtein","reference":"2.0.6"}],
  ["../../../../.cache/yarn/v6/npm-word-wrap-1.2.3-610636f6b1f703891bd34771ccb17fb93b47079c-integrity/node_modules/word-wrap/", {"name":"word-wrap","reference":"1.2.3"}],
  ["../../../../.cache/yarn/v6/npm-progress-2.0.3-7e8cf8d8f5b8f239c1bc68beb4eb78567d572ef8-integrity/node_modules/progress/", {"name":"progress","reference":"2.0.3"}],
  ["../../../../.cache/yarn/v6/npm-regexpp-2.0.1-8d19d31cf632482b589049f8281f93dbcba4d07f-integrity/node_modules/regexpp/", {"name":"regexpp","reference":"2.0.1"}],
  ["../../../../.cache/yarn/v6/npm-strip-json-comments-3.0.1-85713975a91fb87bf1b305cca77395e40d2a64a7-integrity/node_modules/strip-json-comments/", {"name":"strip-json-comments","reference":"3.0.1"}],
  ["../../../../.cache/yarn/v6/npm-table-5.4.6-1292d19500ce3f86053b05f0e8e7e4a3bb21079e-integrity/node_modules/table/", {"name":"table","reference":"5.4.6"}],
  ["../../../../.cache/yarn/v6/npm-slice-ansi-2.1.0-cacd7693461a637a5788d92a7dd4fba068e81636-integrity/node_modules/slice-ansi/", {"name":"slice-ansi","reference":"2.1.0"}],
  ["../../../../.cache/yarn/v6/npm-astral-regex-1.0.0-6c8c3fb827dd43ee3918f27b82782ab7658a6fd9-integrity/node_modules/astral-regex/", {"name":"astral-regex","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-text-table-0.2.0-7f5ee823ae805207c00af2df4a84ec3fcfa570b4-integrity/node_modules/text-table/", {"name":"text-table","reference":"0.2.0"}],
  ["../../../../.cache/yarn/v6/npm-v8-compile-cache-2.1.0-e14de37b31a6d194f5690d67efc4e7f6fc6ab30e-integrity/node_modules/v8-compile-cache/", {"name":"v8-compile-cache","reference":"2.1.0"}],
  ["../../../../.cache/yarn/v6/npm-eslint-plugin-prettier-3.1.2-432e5a667666ab84ce72f945c72f77d996a5c9ba-integrity/node_modules/eslint-plugin-prettier/", {"name":"eslint-plugin-prettier","reference":"3.1.2"}],
  ["../../../../.cache/yarn/v6/npm-prettier-linter-helpers-1.0.0-d23d41fe1375646de2d0104d3454a3008802cf7b-integrity/node_modules/prettier-linter-helpers/", {"name":"prettier-linter-helpers","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-fast-diff-1.2.0-73ee11982d86caaf7959828d519cfe927fac5f03-integrity/node_modules/fast-diff/", {"name":"fast-diff","reference":"1.2.0"}],
  ["../../../../.cache/yarn/v6/npm-mongoose-5.8.7-d175f8ac4c8ed7bf57b71aa4980aaa3525b923b2-integrity/node_modules/mongoose/", {"name":"mongoose","reference":"5.8.7"}],
  ["../../../../.cache/yarn/v6/npm-bson-1.1.3-aa82cb91f9a453aaa060d6209d0675114a8154d3-integrity/node_modules/bson/", {"name":"bson","reference":"1.1.3"}],
  ["../../../../.cache/yarn/v6/npm-kareem-2.3.1-def12d9c941017fabfb00f873af95e9c99e1be87-integrity/node_modules/kareem/", {"name":"kareem","reference":"2.3.1"}],
  ["../../../../.cache/yarn/v6/npm-mongodb-3.4.1-0d15e57e0ea0fc85b7a4fb9291b374c2e71652dc-integrity/node_modules/mongodb/", {"name":"mongodb","reference":"3.4.1"}],
  ["../../../../.cache/yarn/v6/npm-require-optional-1.0.1-4cf35a4247f64ca3df8c2ef208cc494b1ca8fc2e-integrity/node_modules/require_optional/", {"name":"require_optional","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-safe-buffer-5.2.0-b74daec49b1148f88c64b68d49b1e815c1f2f519-integrity/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.2.0"}],
  ["../../../../.cache/yarn/v6/npm-safe-buffer-5.1.2-991ec69d296e0313747d59bdfd2b745c35f8828d-integrity/node_modules/safe-buffer/", {"name":"safe-buffer","reference":"5.1.2"}],
  ["../../../../.cache/yarn/v6/npm-saslprep-1.0.3-4c02f946b56cf54297e347ba1093e7acac4cf226-integrity/node_modules/saslprep/", {"name":"saslprep","reference":"1.0.3"}],
  ["../../../../.cache/yarn/v6/npm-sparse-bitfield-3.0.3-ff4ae6e68656056ba4b3e792ab3334d38273ca11-integrity/node_modules/sparse-bitfield/", {"name":"sparse-bitfield","reference":"3.0.3"}],
  ["../../../../.cache/yarn/v6/npm-memory-pager-1.5.0-d8751655d22d384682741c972f2c3d6dfa3e66b5-integrity/node_modules/memory-pager/", {"name":"memory-pager","reference":"1.5.0"}],
  ["../../../../.cache/yarn/v6/npm-mongoose-legacy-pluralize-1.0.2-3ba9f91fa507b5186d399fb40854bff18fb563e4-integrity/node_modules/mongoose-legacy-pluralize/", {"name":"mongoose-legacy-pluralize","reference":"1.0.2"}],
  ["../../../../.cache/yarn/v6/npm-mpath-0.6.0-aa922029fca4f0f641f360e74c5c1b6a4c47078e-integrity/node_modules/mpath/", {"name":"mpath","reference":"0.6.0"}],
  ["../../../../.cache/yarn/v6/npm-mquery-3.2.2-e1383a3951852ce23e37f619a9b350f1fb3664e7-integrity/node_modules/mquery/", {"name":"mquery","reference":"3.2.2"}],
  ["../../../../.cache/yarn/v6/npm-bluebird-3.5.1-d9551f9de98f1fcda1e683d17ee91a0602ee2eb9-integrity/node_modules/bluebird/", {"name":"bluebird","reference":"3.5.1"}],
  ["../../../../.cache/yarn/v6/npm-regexp-clone-1.0.0-222db967623277056260b992626354a04ce9bf63-integrity/node_modules/regexp-clone/", {"name":"regexp-clone","reference":"1.0.0"}],
  ["../../../../.cache/yarn/v6/npm-sliced-1.0.1-0b3a662b5d04c3177b1926bea82b03f837a2ef41-integrity/node_modules/sliced/", {"name":"sliced","reference":"1.0.1"}],
  ["../../../../.cache/yarn/v6/npm-sift-7.0.1-47d62c50b159d316f1372f8b53f9c10cd21a4b08-integrity/node_modules/sift/", {"name":"sift","reference":"7.0.1"}],
  ["../../../../.cache/yarn/v6/npm-prettier-1.19.1-f7d7f5ff8a9cd872a7be4ca142095956a60797cb-integrity/node_modules/prettier/", {"name":"prettier","reference":"1.19.1"}],
  ["../../../../.cache/yarn/v6/npm-q-1.5.1-7e32f75b41381291d04611f1bf14109ac00651d7-integrity/node_modules/q/", {"name":"q","reference":"1.5.1"}],
  ["./", topLevelLocator],
]);
exports.findPackageLocator = function findPackageLocator(location) {
  let relativeLocation = normalizePath(path.relative(__dirname, location));

  if (!relativeLocation.match(isStrictRegExp))
    relativeLocation = `./${relativeLocation}`;

  if (location.match(isDirRegExp) && relativeLocation.charAt(relativeLocation.length - 1) !== '/')
    relativeLocation = `${relativeLocation}/`;

  let match;

  if (relativeLocation.length >= 177 && relativeLocation[176] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 177)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 155 && relativeLocation[154] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 155)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 153 && relativeLocation[152] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 153)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 149 && relativeLocation[148] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 149)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 147 && relativeLocation[146] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 147)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 143 && relativeLocation[142] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 143)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 141 && relativeLocation[140] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 141)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 137 && relativeLocation[136] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 137)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 135 && relativeLocation[134] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 135)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 134 && relativeLocation[133] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 134)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 133 && relativeLocation[132] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 133)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 131 && relativeLocation[130] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 131)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 129 && relativeLocation[128] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 129)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 127 && relativeLocation[126] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 127)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 125 && relativeLocation[124] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 125)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 124 && relativeLocation[123] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 124)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 123 && relativeLocation[122] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 123)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 121 && relativeLocation[120] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 121)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 120 && relativeLocation[119] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 120)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 119 && relativeLocation[118] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 119)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 118 && relativeLocation[117] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 118)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 117 && relativeLocation[116] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 117)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 115 && relativeLocation[114] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 115)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 114 && relativeLocation[113] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 114)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 113 && relativeLocation[112] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 113)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 111 && relativeLocation[110] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 111)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 110 && relativeLocation[109] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 110)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 107 && relativeLocation[106] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 107)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 105 && relativeLocation[104] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 105)))
      return blacklistCheck(match);

  if (relativeLocation.length >= 2 && relativeLocation[1] === '/')
    if (match = locatorsByLocations.get(relativeLocation.substr(0, 2)))
      return blacklistCheck(match);

  return null;
};


/**
 * Returns the module that should be used to resolve require calls. It's usually the direct parent, except if we're
 * inside an eval expression.
 */

function getIssuerModule(parent) {
  let issuer = parent;

  while (issuer && (issuer.id === '[eval]' || issuer.id === '<repl>' || !issuer.filename)) {
    issuer = issuer.parent;
  }

  return issuer;
}

/**
 * Returns information about a package in a safe way (will throw if they cannot be retrieved)
 */

function getPackageInformationSafe(packageLocator) {
  const packageInformation = exports.getPackageInformation(packageLocator);

  if (!packageInformation) {
    throw makeError(
      `INTERNAL`,
      `Couldn't find a matching entry in the dependency tree for the specified parent (this is probably an internal error)`
    );
  }

  return packageInformation;
}

/**
 * Implements the node resolution for folder access and extension selection
 */

function applyNodeExtensionResolution(unqualifiedPath, {extensions}) {
  // We use this "infinite while" so that we can restart the process as long as we hit package folders
  while (true) {
    let stat;

    try {
      stat = statSync(unqualifiedPath);
    } catch (error) {}

    // If the file exists and is a file, we can stop right there

    if (stat && !stat.isDirectory()) {
      // If the very last component of the resolved path is a symlink to a file, we then resolve it to a file. We only
      // do this first the last component, and not the rest of the path! This allows us to support the case of bin
      // symlinks, where a symlink in "/xyz/pkg-name/.bin/bin-name" will point somewhere else (like "/xyz/pkg-name/index.js").
      // In such a case, we want relative requires to be resolved relative to "/xyz/pkg-name/" rather than "/xyz/pkg-name/.bin/".
      //
      // Also note that the reason we must use readlink on the last component (instead of realpath on the whole path)
      // is that we must preserve the other symlinks, in particular those used by pnp to deambiguate packages using
      // peer dependencies. For example, "/xyz/.pnp/local/pnp-01234569/.bin/bin-name" should see its relative requires
      // be resolved relative to "/xyz/.pnp/local/pnp-0123456789/" rather than "/xyz/pkg-with-peers/", because otherwise
      // we would lose the information that would tell us what are the dependencies of pkg-with-peers relative to its
      // ancestors.

      if (lstatSync(unqualifiedPath).isSymbolicLink()) {
        unqualifiedPath = path.normalize(path.resolve(path.dirname(unqualifiedPath), readlinkSync(unqualifiedPath)));
      }

      return unqualifiedPath;
    }

    // If the file is a directory, we must check if it contains a package.json with a "main" entry

    if (stat && stat.isDirectory()) {
      let pkgJson;

      try {
        pkgJson = JSON.parse(readFileSync(`${unqualifiedPath}/package.json`, 'utf-8'));
      } catch (error) {}

      let nextUnqualifiedPath;

      if (pkgJson && pkgJson.main) {
        nextUnqualifiedPath = path.resolve(unqualifiedPath, pkgJson.main);
      }

      // If the "main" field changed the path, we start again from this new location

      if (nextUnqualifiedPath && nextUnqualifiedPath !== unqualifiedPath) {
        const resolution = applyNodeExtensionResolution(nextUnqualifiedPath, {extensions});

        if (resolution !== null) {
          return resolution;
        }
      }
    }

    // Otherwise we check if we find a file that match one of the supported extensions

    const qualifiedPath = extensions
      .map(extension => {
        return `${unqualifiedPath}${extension}`;
      })
      .find(candidateFile => {
        return existsSync(candidateFile);
      });

    if (qualifiedPath) {
      return qualifiedPath;
    }

    // Otherwise, we check if the path is a folder - in such a case, we try to use its index

    if (stat && stat.isDirectory()) {
      const indexPath = extensions
        .map(extension => {
          return `${unqualifiedPath}/index${extension}`;
        })
        .find(candidateFile => {
          return existsSync(candidateFile);
        });

      if (indexPath) {
        return indexPath;
      }
    }

    // Otherwise there's nothing else we can do :(

    return null;
  }
}

/**
 * This function creates fake modules that can be used with the _resolveFilename function.
 * Ideally it would be nice to be able to avoid this, since it causes useless allocations
 * and cannot be cached efficiently (we recompute the nodeModulePaths every time).
 *
 * Fortunately, this should only affect the fallback, and there hopefully shouldn't be a
 * lot of them.
 */

function makeFakeModule(path) {
  const fakeModule = new Module(path, false);
  fakeModule.filename = path;
  fakeModule.paths = Module._nodeModulePaths(path);
  return fakeModule;
}

/**
 * Normalize path to posix format.
 */

function normalizePath(fsPath) {
  fsPath = path.normalize(fsPath);

  if (process.platform === 'win32') {
    fsPath = fsPath.replace(backwardSlashRegExp, '/');
  }

  return fsPath;
}

/**
 * Forward the resolution to the next resolver (usually the native one)
 */

function callNativeResolution(request, issuer) {
  if (issuer.endsWith('/')) {
    issuer += 'internal.js';
  }

  try {
    enableNativeHooks = false;

    // Since we would need to create a fake module anyway (to call _resolveLookupPath that
    // would give us the paths to give to _resolveFilename), we can as well not use
    // the {paths} option at all, since it internally makes _resolveFilename create another
    // fake module anyway.
    return Module._resolveFilename(request, makeFakeModule(issuer), false);
  } finally {
    enableNativeHooks = true;
  }
}

/**
 * This key indicates which version of the standard is implemented by this resolver. The `std` key is the
 * Plug'n'Play standard, and any other key are third-party extensions. Third-party extensions are not allowed
 * to override the standard, and can only offer new methods.
 *
 * If an new version of the Plug'n'Play standard is released and some extensions conflict with newly added
 * functions, they'll just have to fix the conflicts and bump their own version number.
 */

exports.VERSIONS = {std: 1};

/**
 * Useful when used together with getPackageInformation to fetch information about the top-level package.
 */

exports.topLevel = {name: null, reference: null};

/**
 * Gets the package information for a given locator. Returns null if they cannot be retrieved.
 */

exports.getPackageInformation = function getPackageInformation({name, reference}) {
  const packageInformationStore = packageInformationStores.get(name);

  if (!packageInformationStore) {
    return null;
  }

  const packageInformation = packageInformationStore.get(reference);

  if (!packageInformation) {
    return null;
  }

  return packageInformation;
};

/**
 * Transforms a request (what's typically passed as argument to the require function) into an unqualified path.
 * This path is called "unqualified" because it only changes the package name to the package location on the disk,
 * which means that the end result still cannot be directly accessed (for example, it doesn't try to resolve the
 * file extension, or to resolve directories to their "index.js" content). Use the "resolveUnqualified" function
 * to convert them to fully-qualified paths, or just use "resolveRequest" that do both operations in one go.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveToUnqualified = function resolveToUnqualified(request, issuer, {considerBuiltins = true} = {}) {
  // The 'pnpapi' request is reserved and will always return the path to the PnP file, from everywhere

  if (request === `pnpapi`) {
    return pnpFile;
  }

  // Bailout if the request is a native module

  if (considerBuiltins && builtinModules.has(request)) {
    return null;
  }

  // We allow disabling the pnp resolution for some subpaths. This is because some projects, often legacy,
  // contain multiple levels of dependencies (ie. a yarn.lock inside a subfolder of a yarn.lock). This is
  // typically solved using workspaces, but not all of them have been converted already.

  if (ignorePattern && ignorePattern.test(normalizePath(issuer))) {
    const result = callNativeResolution(request, issuer);

    if (result === false) {
      throw makeError(
        `BUILTIN_NODE_RESOLUTION_FAIL`,
        `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer was explicitely ignored by the regexp "null")`,
        {
          request,
          issuer,
        }
      );
    }

    return result;
  }

  let unqualifiedPath;

  // If the request is a relative or absolute path, we just return it normalized

  const dependencyNameMatch = request.match(pathRegExp);

  if (!dependencyNameMatch) {
    if (path.isAbsolute(request)) {
      unqualifiedPath = path.normalize(request);
    } else if (issuer.match(isDirRegExp)) {
      unqualifiedPath = path.normalize(path.resolve(issuer, request));
    } else {
      unqualifiedPath = path.normalize(path.resolve(path.dirname(issuer), request));
    }
  }

  // Things are more hairy if it's a package require - we then need to figure out which package is needed, and in
  // particular the exact version for the given location on the dependency tree

  if (dependencyNameMatch) {
    const [, dependencyName, subPath] = dependencyNameMatch;

    const issuerLocator = exports.findPackageLocator(issuer);

    // If the issuer file doesn't seem to be owned by a package managed through pnp, then we resort to using the next
    // resolution algorithm in the chain, usually the native Node resolution one

    if (!issuerLocator) {
      const result = callNativeResolution(request, issuer);

      if (result === false) {
        throw makeError(
          `BUILTIN_NODE_RESOLUTION_FAIL`,
          `The builtin node resolution algorithm was unable to resolve the module referenced by "${request}" and requested from "${issuer}" (it didn't go through the pnp resolver because the issuer doesn't seem to be part of the Yarn-managed dependency tree)`,
          {
            request,
            issuer,
          }
        );
      }

      return result;
    }

    const issuerInformation = getPackageInformationSafe(issuerLocator);

    // We obtain the dependency reference in regard to the package that request it

    let dependencyReference = issuerInformation.packageDependencies.get(dependencyName);

    // If we can't find it, we check if we can potentially load it from the packages that have been defined as potential fallbacks.
    // It's a bit of a hack, but it improves compatibility with the existing Node ecosystem. Hopefully we should eventually be able
    // to kill this logic and become stricter once pnp gets enough traction and the affected packages fix themselves.

    if (issuerLocator !== topLevelLocator) {
      for (let t = 0, T = fallbackLocators.length; dependencyReference === undefined && t < T; ++t) {
        const fallbackInformation = getPackageInformationSafe(fallbackLocators[t]);
        dependencyReference = fallbackInformation.packageDependencies.get(dependencyName);
      }
    }

    // If we can't find the path, and if the package making the request is the top-level, we can offer nicer error messages

    if (!dependencyReference) {
      if (dependencyReference === null) {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `You seem to be requiring a peer dependency ("${dependencyName}"), but it is not installed (which might be because you're the top-level package)`,
            {request, issuer, dependencyName}
          );
        } else {
          throw makeError(
            `MISSING_PEER_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" is trying to access a peer dependency ("${dependencyName}") that should be provided by its direct ancestor but isn't`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName}
          );
        }
      } else {
        if (issuerLocator === topLevelLocator) {
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `You cannot require a package ("${dependencyName}") that is not declared in your dependencies (via "${issuer}")`,
            {request, issuer, dependencyName}
          );
        } else {
          const candidates = Array.from(issuerInformation.packageDependencies.keys());
          throw makeError(
            `UNDECLARED_DEPENDENCY`,
            `Package "${issuerLocator.name}@${issuerLocator.reference}" (via "${issuer}") is trying to require the package "${dependencyName}" (via "${request}") without it being listed in its dependencies (${candidates.join(
              `, `
            )})`,
            {request, issuer, issuerLocator: Object.assign({}, issuerLocator), dependencyName, candidates}
          );
        }
      }
    }

    // We need to check that the package exists on the filesystem, because it might not have been installed

    const dependencyLocator = {name: dependencyName, reference: dependencyReference};
    const dependencyInformation = exports.getPackageInformation(dependencyLocator);
    const dependencyLocation = path.resolve(__dirname, dependencyInformation.packageLocation);

    if (!dependencyLocation) {
      throw makeError(
        `MISSING_DEPENDENCY`,
        `Package "${dependencyLocator.name}@${dependencyLocator.reference}" is a valid dependency, but hasn't been installed and thus cannot be required (it might be caused if you install a partial tree, such as on production environments)`,
        {request, issuer, dependencyLocator: Object.assign({}, dependencyLocator)}
      );
    }

    // Now that we know which package we should resolve to, we only have to find out the file location

    if (subPath) {
      unqualifiedPath = path.resolve(dependencyLocation, subPath);
    } else {
      unqualifiedPath = dependencyLocation;
    }
  }

  return path.normalize(unqualifiedPath);
};

/**
 * Transforms an unqualified path into a qualified path by using the Node resolution algorithm (which automatically
 * appends ".js" / ".json", and transforms directory accesses into "index.js").
 */

exports.resolveUnqualified = function resolveUnqualified(
  unqualifiedPath,
  {extensions = Object.keys(Module._extensions)} = {}
) {
  const qualifiedPath = applyNodeExtensionResolution(unqualifiedPath, {extensions});

  if (qualifiedPath) {
    return path.normalize(qualifiedPath);
  } else {
    throw makeError(
      `QUALIFIED_PATH_RESOLUTION_FAILED`,
      `Couldn't find a suitable Node resolution for unqualified path "${unqualifiedPath}"`,
      {unqualifiedPath}
    );
  }
};

/**
 * Transforms a request into a fully qualified path.
 *
 * Note that it is extremely important that the `issuer` path ends with a forward slash if the issuer is to be
 * treated as a folder (ie. "/tmp/foo/" rather than "/tmp/foo" if "foo" is a directory). Otherwise relative
 * imports won't be computed correctly (they'll get resolved relative to "/tmp/" instead of "/tmp/foo/").
 */

exports.resolveRequest = function resolveRequest(request, issuer, {considerBuiltins, extensions} = {}) {
  let unqualifiedPath;

  try {
    unqualifiedPath = exports.resolveToUnqualified(request, issuer, {considerBuiltins});
  } catch (originalError) {
    // If we get a BUILTIN_NODE_RESOLUTION_FAIL error there, it means that we've had to use the builtin node
    // resolution, which usually shouldn't happen. It might be because the user is trying to require something
    // from a path loaded through a symlink (which is not possible, because we need something normalized to
    // figure out which package is making the require call), so we try to make the same request using a fully
    // resolved issuer and throws a better and more actionable error if it works.
    if (originalError.code === `BUILTIN_NODE_RESOLUTION_FAIL`) {
      let realIssuer;

      try {
        realIssuer = realpathSync(issuer);
      } catch (error) {}

      if (realIssuer) {
        if (issuer.endsWith(`/`)) {
          realIssuer = realIssuer.replace(/\/?$/, `/`);
        }

        try {
          exports.resolveToUnqualified(request, realIssuer, {considerBuiltins});
        } catch (error) {
          // If an error was thrown, the problem doesn't seem to come from a path not being normalized, so we
          // can just throw the original error which was legit.
          throw originalError;
        }

        // If we reach this stage, it means that resolveToUnqualified didn't fail when using the fully resolved
        // file path, which is very likely caused by a module being invoked through Node with a path not being
        // correctly normalized (ie you should use "node $(realpath script.js)" instead of "node script.js").
        throw makeError(
          `SYMLINKED_PATH_DETECTED`,
          `A pnp module ("${request}") has been required from what seems to be a symlinked path ("${issuer}"). This is not possible, you must ensure that your modules are invoked through their fully resolved path on the filesystem (in this case "${realIssuer}").`,
          {
            request,
            issuer,
            realIssuer,
          }
        );
      }
    }
    throw originalError;
  }

  if (unqualifiedPath === null) {
    return null;
  }

  try {
    return exports.resolveUnqualified(unqualifiedPath, {extensions});
  } catch (resolutionError) {
    if (resolutionError.code === 'QUALIFIED_PATH_RESOLUTION_FAILED') {
      Object.assign(resolutionError.data, {request, issuer});
    }
    throw resolutionError;
  }
};

/**
 * Setups the hook into the Node environment.
 *
 * From this point on, any call to `require()` will go through the "resolveRequest" function, and the result will
 * be used as path of the file to load.
 */

exports.setup = function setup() {
  // A small note: we don't replace the cache here (and instead use the native one). This is an effort to not
  // break code similar to "delete require.cache[require.resolve(FOO)]", where FOO is a package located outside
  // of the Yarn dependency tree. In this case, we defer the load to the native loader. If we were to replace the
  // cache by our own, the native loader would populate its own cache, which wouldn't be exposed anymore, so the
  // delete call would be broken.

  const originalModuleLoad = Module._load;

  Module._load = function(request, parent, isMain) {
    if (!enableNativeHooks) {
      return originalModuleLoad.call(Module, request, parent, isMain);
    }

    // Builtins are managed by the regular Node loader

    if (builtinModules.has(request)) {
      try {
        enableNativeHooks = false;
        return originalModuleLoad.call(Module, request, parent, isMain);
      } finally {
        enableNativeHooks = true;
      }
    }

    // The 'pnpapi' name is reserved to return the PnP api currently in use by the program

    if (request === `pnpapi`) {
      return pnpModule.exports;
    }

    // Request `Module._resolveFilename` (ie. `resolveRequest`) to tell us which file we should load

    const modulePath = Module._resolveFilename(request, parent, isMain);

    // Check if the module has already been created for the given file

    const cacheEntry = Module._cache[modulePath];

    if (cacheEntry) {
      return cacheEntry.exports;
    }

    // Create a new module and store it into the cache

    const module = new Module(modulePath, parent);
    Module._cache[modulePath] = module;

    // The main module is exposed as global variable

    if (isMain) {
      process.mainModule = module;
      module.id = '.';
    }

    // Try to load the module, and remove it from the cache if it fails

    let hasThrown = true;

    try {
      module.load(modulePath);
      hasThrown = false;
    } finally {
      if (hasThrown) {
        delete Module._cache[modulePath];
      }
    }

    // Some modules might have to be patched for compatibility purposes

    for (const [filter, patchFn] of patchedModules) {
      if (filter.test(request)) {
        module.exports = patchFn(exports.findPackageLocator(parent.filename), module.exports);
      }
    }

    return module.exports;
  };

  const originalModuleResolveFilename = Module._resolveFilename;

  Module._resolveFilename = function(request, parent, isMain, options) {
    if (!enableNativeHooks) {
      return originalModuleResolveFilename.call(Module, request, parent, isMain, options);
    }

    let issuers;

    if (options) {
      const optionNames = new Set(Object.keys(options));
      optionNames.delete('paths');

      if (optionNames.size > 0) {
        throw makeError(
          `UNSUPPORTED`,
          `Some options passed to require() aren't supported by PnP yet (${Array.from(optionNames).join(', ')})`
        );
      }

      if (options.paths) {
        issuers = options.paths.map(entry => `${path.normalize(entry)}/`);
      }
    }

    if (!issuers) {
      const issuerModule = getIssuerModule(parent);
      const issuer = issuerModule ? issuerModule.filename : `${process.cwd()}/`;

      issuers = [issuer];
    }

    let firstError;

    for (const issuer of issuers) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, issuer);
      } catch (error) {
        firstError = firstError || error;
        continue;
      }

      return resolution !== null ? resolution : request;
    }

    throw firstError;
  };

  const originalFindPath = Module._findPath;

  Module._findPath = function(request, paths, isMain) {
    if (!enableNativeHooks) {
      return originalFindPath.call(Module, request, paths, isMain);
    }

    for (const path of paths || []) {
      let resolution;

      try {
        resolution = exports.resolveRequest(request, path);
      } catch (error) {
        continue;
      }

      if (resolution) {
        return resolution;
      }
    }

    return false;
  };

  process.versions.pnp = String(exports.VERSIONS.std);
};

exports.setupCompatibilityLayer = () => {
  // ESLint currently doesn't have any portable way for shared configs to specify their own
  // plugins that should be used (https://github.com/eslint/eslint/issues/10125). This will
  // likely get fixed at some point, but it'll take time and in the meantime we'll just add
  // additional fallback entries for common shared configs.

  for (const name of [`react-scripts`]) {
    const packageInformationStore = packageInformationStores.get(name);
    if (packageInformationStore) {
      for (const reference of packageInformationStore.keys()) {
        fallbackLocators.push({name, reference});
      }
    }
  }

  // Modern versions of `resolve` support a specific entry point that custom resolvers can use
  // to inject a specific resolution logic without having to patch the whole package.
  //
  // Cf: https://github.com/browserify/resolve/pull/174

  patchedModules.push([
    /^\.\/normalize-options\.js$/,
    (issuer, normalizeOptions) => {
      if (!issuer || issuer.name !== 'resolve') {
        return normalizeOptions;
      }

      return (request, opts) => {
        opts = opts || {};

        if (opts.forceNodeResolution) {
          return opts;
        }

        opts.preserveSymlinks = true;
        opts.paths = function(request, basedir, getNodeModulesDir, opts) {
          // Extract the name of the package being requested (1=full name, 2=scope name, 3=local name)
          const parts = request.match(/^((?:(@[^\/]+)\/)?([^\/]+))/);

          // make sure that basedir ends with a slash
          if (basedir.charAt(basedir.length - 1) !== '/') {
            basedir = path.join(basedir, '/');
          }
          // This is guaranteed to return the path to the "package.json" file from the given package
          const manifestPath = exports.resolveToUnqualified(`${parts[1]}/package.json`, basedir);

          // The first dirname strips the package.json, the second strips the local named folder
          let nodeModules = path.dirname(path.dirname(manifestPath));

          // Strips the scope named folder if needed
          if (parts[2]) {
            nodeModules = path.dirname(nodeModules);
          }

          return [nodeModules];
        };

        return opts;
      };
    },
  ]);
};

if (module.parent && module.parent.id === 'internal/preload') {
  exports.setupCompatibilityLayer();

  exports.setup();
}

if (process.mainModule === module) {
  exports.setupCompatibilityLayer();

  const reportError = (code, message, data) => {
    process.stdout.write(`${JSON.stringify([{code, message, data}, null])}\n`);
  };

  const reportSuccess = resolution => {
    process.stdout.write(`${JSON.stringify([null, resolution])}\n`);
  };

  const processResolution = (request, issuer) => {
    try {
      reportSuccess(exports.resolveRequest(request, issuer));
    } catch (error) {
      reportError(error.code, error.message, error.data);
    }
  };

  const processRequest = data => {
    try {
      const [request, issuer] = JSON.parse(data);
      processResolution(request, issuer);
    } catch (error) {
      reportError(`INVALID_JSON`, error.message, error.data);
    }
  };

  if (process.argv.length > 2) {
    if (process.argv.length !== 4) {
      process.stderr.write(`Usage: ${process.argv[0]} ${process.argv[1]} <request> <issuer>\n`);
      process.exitCode = 64; /* EX_USAGE */
    } else {
      processResolution(process.argv[2], process.argv[3]);
    }
  } else {
    let buffer = '';
    const decoder = new StringDecoder.StringDecoder();

    process.stdin.on('data', chunk => {
      buffer += decoder.write(chunk);

      do {
        const index = buffer.indexOf('\n');
        if (index === -1) {
          break;
        }

        const line = buffer.slice(0, index);
        buffer = buffer.slice(index + 1);

        processRequest(line);
      } while (true);
    });
  }
}
